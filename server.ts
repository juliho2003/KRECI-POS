import express from 'express';
import http from 'http';
import os from 'os';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { createApiApp } from './server/createApp.ts';
import { initDatabase, setDatabaseDriver, touchServerUserPresence } from './server/db.ts';
import { createNodeSqliteDriver } from './server/nodeDriver.ts';
import type { PresenceMember, RealtimeEventType, RealtimeMessage, ServerUser } from './src/types.ts';

const PORT = Number(process.env.PORT || 3000);
const SERVER_START_TIME = Date.now();

function getLanUrls(port: number): string[] {
  const nets = os.networkInterfaces();
  const urls: string[] = [];
  for (const iface of Object.values(nets)) {
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) {
        urls.push(`http://${addr.address}:${port}`);
      }
    }
  }
  const host = os.hostname().replace(/\.local$/i, '').trim();
  if (host && host.toLowerCase() !== 'localhost' && !/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    urls.push(`http://${host}.local:${port}`);
  }
  return Array.from(new Set(urls));
}

async function startServer() {
  setDatabaseDriver(createNodeSqliteDriver());
  initDatabase();

  const presenceMap = new Map<WebSocket, PresenceMember>();
  const getOnlineMembers = (): PresenceMember[] => Array.from(presenceMap.values());

  let wss: WebSocketServer;

  function broadcast(type: RealtimeEventType, detail?: string, extra?: Partial<RealtimeMessage>) {
    if (!wss) return;
    const payload: RealtimeMessage = {
      type,
      timestamp: new Date().toISOString(),
      detail,
      ...extra,
    };
    const msg = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  }

  function broadcastPresence() {
    broadcast('presence:updated', undefined, { members: getOnlineMembers() });
  }

  const app = createApiApp({
    runtime: 'node',
    realtimeMode: 'ws',
    port: PORT,
    serverStartTime: SERVER_START_TIME,
    getLanUrls,
    getOnlineMembers,
    broadcast,
    broadcastPresence,
    onUserUpdated: (updated: ServerUser) => {
      for (const [sock, member] of presenceMap.entries()) {
        if (member.serverUserId === updated.id || member.clientId === updated.clientId) {
          presenceMap.set(sock, {
            ...member,
            name: updated.name,
            role: updated.role,
            color: updated.color,
            accessLevel: updated.accessLevel,
            canEdit: updated.status === 'ACTIVE' && updated.canEdit,
          });
        }
      }
    },
  });

  const server = http.createServer(app);
  wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const pathname = (request.url || '').split('?')[0];
    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws) => {
    const now = new Date().toISOString();
    presenceMap.set(ws, {
      clientId: `anon-${Math.random().toString(36).slice(2, 8)}`,
      serverUserId: null,
      name: 'Team Device',
      role: 'Operator',
      color: '#d97706',
      accessLevel: 'EDITOR',
      canEdit: true,
      activeView: 'pos',
      editingKey: null,
      connectedAt: now,
      lastSeenAt: now,
    });

    ws.send(
      JSON.stringify({
        type: 'presence:updated',
        timestamp: now,
        detail: 'connected',
        members: getOnlineMembers(),
      })
    );
    broadcastPresence();

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as {
          kind?: string;
          clientId?: string;
          serverUserId?: number | null;
          name?: string;
          role?: string;
          color?: string;
          syncProfile?: boolean;
          activeView?: string;
          editingKey?: string | null;
        };
        if (msg.kind === 'ping') {
          const prev = presenceMap.get(ws);
          if (prev) {
            prev.lastSeenAt = new Date().toISOString();
          }
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'presence:updated', timestamp: new Date().toISOString(), detail: 'pong' }));
          }
          return;
        }
        if (msg.kind === 'presence') {
          const prev = presenceMap.get(ws);
          const clientId = msg.clientId || prev?.clientId || `dev-${Date.now()}`;
          const name = (msg.name || prev?.name || 'Team Member').slice(0, 40);
          const role = (msg.role || prev?.role || 'Staff').slice(0, 32);
          const color = msg.color || prev?.color || '#d97706';

          const dbUser = touchServerUserPresence({
            clientId,
            serverUserId: msg.serverUserId ?? prev?.serverUserId ?? null,
            name,
            role,
            color,
            syncProfile: Boolean(msg.syncProfile),
            activeView: msg.activeView || prev?.activeView || 'pos',
            editingKey: msg.editingKey ?? null,
          });

          const userChanged =
            !prev ||
            prev.serverUserId !== dbUser.id ||
            prev.name !== dbUser.name ||
            prev.role !== dbUser.role ||
            prev.color !== dbUser.color;

          presenceMap.set(ws, {
            clientId,
            serverUserId: dbUser.id,
            name: dbUser.name,
            role: dbUser.role,
            color: dbUser.color,
            accessLevel: dbUser.accessLevel,
            canEdit: dbUser.status === 'ACTIVE' && dbUser.canEdit,
            activeView: msg.activeView || prev?.activeView || 'pos',
            editingKey: msg.editingKey ?? null,
            connectedAt: prev?.connectedAt || new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
          });
          broadcastPresence();
          if (userChanged) {
            broadcast('users:updated', dbUser.name);
          }
        }
      } catch {
        // ignore malformed WS frames
      }
    });

    ws.on('close', () => {
      presenceMap.delete(ws);
      broadcastPresence();
      broadcast('users:updated', 'disconnected');
    });
  });

  // Vite Dev Middleware or Static Prod Serving
  if (process.env.NODE_ENV !== 'production') {
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: hmrDisabled ? false : { server },
        ws: { server },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    const lanUrls = getLanUrls(PORT);
    console.log(`KR-ONCUE Team Server running on http://0.0.0.0:${PORT}`);
    for (const url of lanUrls) {
      console.log(`  LAN Team Access: ${url}`);
    }
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
