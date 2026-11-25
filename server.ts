import express from 'express';
import http from 'http';
import os from 'os';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { createApiApp, extractClientIp } from './server/createApp.ts';
import {
  getActivePresenceMembersFromDb,
  initDatabase,
  setDatabaseDriver,
  touchServerUserPresence,
} from './server/db.ts';
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
  setDatabaseDriver(await createNodeSqliteDriver());
  initDatabase();

  const presenceMap = new Map<WebSocket, PresenceMember>();
  const getOnlineMembers = (): PresenceMember[] => {
    const byUserId = new Map<number, PresenceMember>();
    const dbActive = getActivePresenceMembersFromDb(120_000);
    for (const m of dbActive) {
      if (m.serverUserId) {
        byUserId.set(m.serverUserId, m);
      }
    }
    for (const m of presenceMap.values()) {
      if (m.serverUserId) {
        byUserId.set(m.serverUserId, m);
      }
    }
    return Array.from(byUserId.values());
  };

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
    onPresenceTouched: (touched: ServerUser, deviceIp: string) => {
      for (const [sock, member] of presenceMap.entries()) {
        if (touched.deviceId && member.deviceId === touched.deviceId && member.serverUserId !== touched.id) {
          presenceMap.delete(sock);
        } else if (member.serverUserId === touched.id) {
          presenceMap.set(sock, {
            ...member,
            name: touched.name,
            role: touched.role,
            color: touched.color,
            accessLevel: touched.accessLevel,
            canEdit: touched.status === 'ACTIVE' && touched.canEdit,
            deviceId: touched.deviceId || member.deviceId,
            deviceName: touched.deviceName || member.deviceName,
            deviceIp: deviceIp || touched.deviceIp || member.deviceIp,
            lastSeenAt: touched.lastSeenAt,
          });
        }
      }
    },
    onPresenceLeft: ({ serverUserId, deviceId }) => {
      for (const [sock, member] of presenceMap.entries()) {
        if (
          (serverUserId && member.serverUserId === serverUserId) ||
          (deviceId && member.deviceId === deviceId)
        ) {
          presenceMap.delete(sock);
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

  wss.on('connection', (ws, request) => {
    const now = new Date().toISOString();
    const socketIp = extractClientIp(request);

    ws.send(
      JSON.stringify({
        type: 'presence:updated',
        timestamp: now,
        detail: 'connected',
        members: getOnlineMembers(),
      })
    );

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
          deviceId?: string;
          deviceName?: string;
        };
        if (msg.kind === 'ping') {
          const prev = presenceMap.get(ws);
          if (prev) {
            prev.lastSeenAt = new Date().toISOString();
            if (prev.serverUserId) {
              touchServerUserPresence({
                clientId: prev.clientId,
                serverUserId: prev.serverUserId,
                name: prev.name,
                role: prev.role,
                color: prev.color,
                activeView: prev.activeView,
                editingKey: prev.editingKey ?? null,
                deviceId: prev.deviceId,
                deviceName: prev.deviceName,
                deviceIp: socketIp,
              });
            }
          }
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'presence:updated', timestamp: new Date().toISOString(), detail: 'pong' }));
          }
          return;
        }
        if (msg.kind === 'presence') {
          const prev = presenceMap.get(ws);
          const clientId = (msg.clientId || prev?.clientId || '').trim();
          const name = (msg.name || prev?.name || '').slice(0, 40);
          const role = (msg.role || prev?.role || 'Team Member').slice(0, 32);
          const color = msg.color || prev?.color || '#d97706';
          const deviceId = (msg.deviceId || prev?.deviceId || clientId).slice(0, 80);
          const deviceName = (msg.deviceName || prev?.deviceName || '').slice(0, 80);

          const dbUser = (msg.serverUserId || clientId)
            ? touchServerUserPresence({
                clientId,
                serverUserId: msg.serverUserId ?? prev?.serverUserId ?? null,
                name,
                role,
                color,
                syncProfile: Boolean(msg.syncProfile),
                activeView: msg.activeView || prev?.activeView || 'pos',
                editingKey: msg.editingKey ?? null,
                deviceId,
                deviceName,
                deviceIp: socketIp,
              })
            : undefined;

          if (!dbUser || dbUser.status !== 'ACTIVE') {
            if (presenceMap.has(ws)) {
              presenceMap.delete(ws);
              broadcastPresence();
            }
            return;
          }

          const userChanged =
            !prev ||
            prev.serverUserId !== dbUser.id ||
            prev.name !== dbUser.name ||
            prev.role !== dbUser.role ||
            prev.color !== dbUser.color ||
            prev.deviceIp !== socketIp;

          presenceMap.set(ws, {
            clientId: dbUser.clientId,
            serverUserId: dbUser.id,
            name: dbUser.name,
            role: dbUser.role,
            color: dbUser.color,
            accessLevel: dbUser.accessLevel,
            canEdit: dbUser.status === 'ACTIVE' && dbUser.canEdit,
            activeView: msg.activeView || prev?.activeView || 'pos',
            editingKey: msg.editingKey ?? null,
            deviceId: dbUser.deviceId || deviceId,
            deviceName: dbUser.deviceName || deviceName,
            deviceIp: dbUser.deviceIp || socketIp,
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
      if (presenceMap.has(ws)) {
        presenceMap.delete(ws);
        // Keep DB presence active within lease window so refreshes/brief WS reconnects don't drop live users
        broadcastPresence();
      }
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
