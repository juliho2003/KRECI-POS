import express from 'express';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import {
  cancelReservedRental,
  createBudgetRequest,
  createBusiness,
  createClient,
  createInventoryItem,
  createMaintenanceSlip,
  createPayment,
  createQuote,
  createRental,
  createServerUser,
  createSharedDraft,
  createSqliteBackupCopy,
  deleteBudgetRequest,
  deleteBusiness,
  deleteClient,
  deleteInventoryItem,
  deleteQuote,
  deleteServerSavepoint,
  deleteServerUser,
  deleteSharedDraft,
  dispatchReservedRental,
  exportFullBackup,
  getActivityLog,
  getBudgetRequests,
  getBusinesses,
  getClients,
  getDashboardSummary,
  getDatabaseStats,
  getInventory,
  getMaintenanceSlips,
  getPayments,
  getQuotes,
  getRentals,
  getServerSavepointPayload,
  getServerSavepoints,
  getServerSettings,
  getServerUserByClientId,
  getServerUserById,
  getServerUserByToken,
  getServerUsers,
  getSharedDrafts,
  initDatabase,
  logActivity,
  processReturnInspection,
  restoreFullBackup,
  restoreServerSavepoint,
  saveServerCheckpoint,
  touchServerUserPresence,
  updateBudgetRequest,
  updateBudgetStatus,
  updateBusiness,
  updateClient,
  updateInventoryItem,
  updateMaintenanceSlip,
  updatePayment,
  updateQuote,
  updateQuoteStatus,
  updateRental,
  updateServerSettings,
  updateServerUser,
  updateSharedDraft,
} from './server/db.ts';
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

function extractApiToken(req: express.Request): string {
  const auth = req.header('authorization') ?? '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  const apiKey = req.header('x-api-key');
  if (apiKey && apiKey.trim()) {
    return apiKey.trim();
  }
  if (typeof req.query.token === 'string' && req.query.token.trim()) {
    return req.query.token.trim();
  }
  return '';
}

function getActor(req: express.Request): string {
  const raw = req.header('x-operator-name');
  if (raw && raw.trim()) {
    return decodeURIComponent(raw.trim()).slice(0, 48);
  }
  const token = extractApiToken(req);
  if (token) {
    const tokenUser = getServerUserByToken(token);
    if (tokenUser) return tokenUser.name;
  }
  return 'Team Member';
}

async function startServer() {
  initDatabase();

  const app = express();
  app.use(express.json({ limit: '12mb' }));

  // Apple Safari / Shortcuts / Swift / Cross-device CORS support for /api
  app.use('/api', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-API-Key, X-Team-Pin, X-Operator-Name, X-Client-Id, X-Server-User-Id'
    );
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  const presenceMap = new Map<WebSocket, PresenceMember>();

  function getOnlineMembers(): PresenceMember[] {
    return Array.from(presenceMap.values());
  }

  function getEnrichedServerUsers(): ServerUser[] {
    const users = getServerUsers();
    const onlineList = getOnlineMembers();
    return users.map((u) => {
      const live = onlineList.find(
        (m) => (m.serverUserId && m.serverUserId === u.id) || m.clientId === u.clientId
      );
      return {
        ...u,
        isOnline: Boolean(live),
        activeView: live?.activeView ?? undefined,
        editingKey: live?.editingKey ?? null,
        lastSeenAt: live?.lastSeenAt ?? u.lastSeenAt,
      };
    });
  }

  function broadcast(type: RealtimeEventType, detail?: string, extra?: Partial<RealtimeMessage>) {
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

  // Optional Team Edit PIN + Server User access & Bearer Token middleware for mutating routes
  app.use('/api', (req, res, next) => {
    const apiToken = extractApiToken(req);
    const tokenUser = apiToken ? getServerUserByToken(apiToken) : undefined;

    if (apiToken && !tokenUser) {
      res.status(401).json({ error: 'Invalid or unknown API Bearer token.' });
      return;
    }

    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      if (tokenUser && tokenUser.status === 'REVOKED') {
        res.status(403).json({
          error: `Access for ${tokenUser.name} has been revoked by the server owner.`,
        });
        return;
      }
      next();
      return;
    }
    if (req.path === '/auth/verify-pin') {
      next();
      return;
    }

    const serverUserIdHeader = req.header('x-server-user-id');
    const clientIdHeader = req.header('x-client-id');
    const userRecord = tokenUser
      ? tokenUser
      : serverUserIdHeader
        ? getServerUserById(Number(serverUserIdHeader))
        : clientIdHeader
          ? getServerUserByClientId(clientIdHeader)
          : undefined;

    if (userRecord) {
      if (userRecord.status === 'REVOKED') {
        res.status(403).json({
          error: `Access for ${userRecord.name} has been revoked by the server owner.`,
        });
        return;
      }
      if (!userRecord.canEdit || userRecord.accessLevel === 'VIEWER') {
        res.status(403).json({
          error: `${userRecord.name} currently has View-Only access on this server.`,
        });
        return;
      }
    }

    const settings = getServerSettings();
    if (settings.teamPinEnabled && settings.teamPin) {
      const provided = req.header('x-team-pin') ?? '';
      if (provided !== settings.teamPin) {
        res.status(401).json({
          error: 'Team Edit PIN is required to save changes on this server.',
          pinRequired: true,
        });
        return;
      }
    }
    next();
  });

  // --- API ROUTES ---

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'kr-oncue-pos' });
  });

  app.get('/api/server-info', (_req, res) => {
    try {
      const settings = getServerSettings();
      const stats = getDatabaseStats();
      res.json({
        serverLabel: settings.serverLabel,
        teamPinEnabled: settings.teamPinEnabled,
        hostname: os.hostname(),
        port: PORT,
        platform: `${os.platform()} ${os.arch()}`,
        uptimeSeconds: Math.floor((Date.now() - SERVER_START_TIME) / 1000),
        lanUrls: getLanUrls(PORT),
        publicAppUrl: process.env.APP_URL || '',
        dbPath: stats.dbPath,
        dbSizeBytes: stats.dbSizeBytes,
        lastSavedAt: stats.lastSavedAt,
        lastManualSaveAt: settings.lastManualSaveAt,
        lastManualSaveBy: settings.lastManualSaveBy,
        counts: stats.counts,
        onlineMembers: getOnlineMembers(),
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Apple Shortcuts / iOS / macOS Swift / Mobile REST API Endpoints
  app.get('/api/apple/summary', (req, res) => {
    try {
      const settings = getServerSettings();
      const summary = getDashboardSummary();
      const users = getEnrichedServerUsers();
      const rentals = getRentals().filter((r) => r.status === 'DISPATCHED' || r.status === 'RESERVED' || r.status === 'PARTIAL_RETURN');
      const quotes = getQuotes().filter((q) => q.status === 'DRAFT' || q.status === 'SENT' || q.status === 'APPROVED');
      const token = extractApiToken(req);
      const authUser = token ? getServerUserByToken(token) : undefined;

      res.json({
        serverLabel: settings.serverLabel,
        generatedAt: new Date().toISOString(),
        authenticatedAs: authUser
          ? { id: authUser.id, name: authUser.name, accessLevel: authUser.accessLevel, canEdit: authUser.canEdit }
          : null,
        totals: {
          unitsOnHand: summary.totalUnitsOnHand,
          unitsAvailable: summary.totalUnitsAvailable,
          unitsOut: summary.totalUnitsOut,
          maintenance: summary.maintenanceCount,
          activeRentals: summary.activeRentalsCount,
          openQuotes: summary.pendingQuotesCount,
          collectedRevenue: summary.totalRevenueCollected,
          outstandingReceivables: summary.outstandingReceivables,
        },
        businesses: summary.businessStats,
        onlineUsersCount: users.filter((u) => u.isOnline).length,
        totalSharedUsers: users.length,
        onlineUsers: users
          .filter((u) => u.isOnline)
          .map((u) => ({
            id: u.id,
            name: u.name,
            role: u.role,
            accessLevel: u.accessLevel,
            activeView: u.activeView ?? 'pos',
            editingKey: u.editingKey ?? null,
          })),
        activeRentalsPreview: rentals.slice(0, 10).map((r) => ({
          slipNo: r.slipNo,
          borrowerName: r.borrowerName,
          eventPurpose: r.eventPurpose,
          status: r.status,
          expectedReturn: r.expectedReturn,
          balanceDue: r.balanceDue,
        })),
        openQuotesPreview: quotes.slice(0, 10).map((q) => ({
          quoteNo: q.quoteNo,
          clientName: q.clientName,
          eventName: q.eventName,
          status: q.status,
          totalAmount: q.totalAmount,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/apple/inventory.csv', (_req, res) => {
    try {
      const items = getInventory({});
      const esc = (val: unknown) => `"${String(val ?? '').replace(/"/g, '""')}"`;
      const header = [
        'Code',
        'Category Code',
        'Category Name',
        'Equipment Name',
        'Brand / Model',
        'Placement',
        'Location',
        'Qty On Hand',
        'Qty Out',
        'Qty Reserved',
        'Qty Available',
        'Daily Rate (PHP)',
        'Condition',
        'Status',
        'Remarks',
      ].join(',');
      const lines = items.map((i) =>
        [
          esc(i.code),
          esc(i.categoryCode),
          esc(i.categoryName),
          esc(i.name),
          esc(i.brand),
          esc(i.placement),
          esc(i.location),
          i.qtyOnHand,
          i.qtyOut,
          i.qtyReserved,
          i.qtyAvailable,
          i.rentalRate,
          esc(i.condition),
          esc(i.status),
          esc(i.remarks),
        ].join(',')
      );
      const dateStamp = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="kr-oncue-inventory-${dateStamp}.csv"`);
      // UTF-8 BOM for Apple Numbers & Excel
      res.send('\uFEFF' + [header, ...lines].join('\r\n'));
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/apple/openapi.json', (req, res) => {
    const proto = req.header('x-forwarded-proto') || req.protocol || 'http';
    const host = req.header('host') || `localhost:${PORT}`;
    const serverUrl = `${proto}://${host}`;
    res.json({
      openapi: '3.0.3',
      info: {
        title: 'KR-ONCUE Team Server & Rental POS API',
        version: '1.0.0',
        description:
          'REST & WebSocket API compatible with Apple Shortcuts, iOS/macOS Swift URLSession, Safari Web App, and Apple Numbers.',
      },
      servers: [{ url: serverUrl }],
      security: [{ BearerToken: [] }],
      components: {
        securitySchemes: {
          BearerToken: {
            type: 'http',
            scheme: 'bearer',
            description: 'Use any active Server User inviteToken as Authorization: Bearer <token> or X-API-Key: <token>.',
          },
        },
      },
      paths: {
        '/api/apple/summary': { get: { summary: 'Live Apple Shortcuts / Dashboard summary' } },
        '/api/apple/inventory.csv': { get: { summary: 'UTF-8 BOM Inventory CSV for Apple Numbers' } },
        '/api/inventory': {
          get: { summary: 'List master inventory (supports ?category=AS&status=AVAILABLE&q=speaker)' },
          post: { summary: 'Add equipment item' },
        },
        '/api/quotes': { get: { summary: 'List quotations' }, post: { summary: 'Create quotation' } },
        '/api/rentals': { get: { summary: 'List active rentals & returns' }, post: { summary: 'Create rental slip' } },
        '/api/clients': { get: { summary: 'List clients' }, post: { summary: 'Create client' } },
        '/api/server-users': { get: { summary: 'List live shared server users' }, post: { summary: 'Add shared user' } },
        '/api/server/save': { post: { summary: 'Checkpoint and flush all data to main server' } },
      },
    });
  });

  app.post('/api/auth/verify-pin', (req, res) => {
    const settings = getServerSettings();
    if (!settings.teamPinEnabled || !settings.teamPin) {
      res.json({ ok: true, teamPinEnabled: false });
      return;
    }
    const pin = String(req.body?.pin ?? '').trim();
    if (pin === settings.teamPin) {
      res.json({ ok: true, teamPinEnabled: true });
    } else {
      res.status(401).json({ ok: false, error: 'Incorrect Team Edit PIN' });
    }
  });

  app.patch('/api/server-settings', (req, res) => {
    try {
      const actor = getActor(req);
      const updated = updateServerSettings({
        serverLabel: req.body.serverLabel,
        teamPinEnabled: req.body.teamPinEnabled,
        teamPin: req.body.teamPin,
      });
      logActivity(actor, 'UPDATE', 'settings', 'server', `Updated server sharing settings (${updated.serverLabel})`);
      broadcast('settings:updated', updated.serverLabel);
      broadcast('activity:updated');
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get('/api/activity', (_req, res) => {
    try {
      res.json(getActivityLog(100));
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Live Server Users & Shared Web Access
  app.get('/api/server-users', (_req, res) => {
    try {
      res.json(getEnrichedServerUsers());
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/server-users/resolve', (req, res) => {
    try {
      const token = String(req.query.invite ?? '').trim();
      if (!token) {
        res.status(400).json({ error: 'Invite token is required' });
        return;
      }
      const user = getServerUserByToken(token);
      if (!user) {
        res.status(404).json({ error: 'Shared user access link not found' });
        return;
      }
      if (user.status === 'REVOKED') {
        res.status(403).json({ error: 'Access for this user link has been revoked' });
        return;
      }
      res.json(user);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/server-users', (req, res) => {
    try {
      if (!req.body?.name || !String(req.body.name).trim()) {
        res.status(400).json({ error: 'User name is required' });
        return;
      }
      const actor = getActor(req);
      const user = createServerUser({
        name: req.body.name,
        email: req.body.email,
        role: req.body.role,
        color: req.body.color,
        accessLevel: req.body.accessLevel,
        canEdit: req.body.canEdit,
        addedBy: actor,
      });
      logActivity(
        actor,
        'USER',
        'server_user',
        String(user.id),
        `Shared server access with ${user.name} (${user.accessLevel})`
      );
      broadcast('users:updated', user.name);
      broadcast('activity:updated', actor);
      res.status(201).json(user);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.patch('/api/server-users/:id', (req, res) => {
    try {
      const actor = getActor(req);
      const updated = updateServerUser(Number(req.params.id), req.body);

      // Update any live WebSocket session belonging to this ServerUser immediately
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

      logActivity(
        actor,
        'USER',
        'server_user',
        String(updated.id),
        `Updated access for ${updated.name} (${updated.accessLevel}, ${updated.status})`
      );
      broadcastPresence();
      broadcast('users:updated', updated.name);
      broadcast('activity:updated', actor);
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.delete('/api/server-users/:id', (req, res) => {
    try {
      const actor = getActor(req);
      deleteServerUser(Number(req.params.id));
      logActivity(actor, 'DELETE', 'server_user', req.params.id, `Removed server user #${req.params.id}`);
      broadcast('users:updated', req.params.id);
      broadcast('activity:updated', actor);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get('/api/dashboard', (_req, res) => {
    try {
      res.json(getDashboardSummary());
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Businesses (Multi-Business POS Units)
  app.get('/api/businesses', (_req, res) => {
    try {
      res.json(getBusinesses());
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/businesses', (req, res) => {
    try {
      const actor = getActor(req);
      const biz = createBusiness(req.body);
      logActivity(actor, 'CREATE', 'business', biz.id, `Added business POS "${biz.name}" (${biz.code})`);
      broadcast('business:updated', biz.id);
      broadcast('activity:updated');
      res.status(201).json(biz);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.patch('/api/businesses/:id', (req, res) => {
    try {
      const actor = getActor(req);
      const updated = updateBusiness(req.params.id, req.body);
      logActivity(actor, 'UPDATE', 'business', updated.id, `Updated business POS "${updated.name}"`);
      broadcast('business:updated', updated.id);
      broadcast('activity:updated');
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.delete('/api/businesses/:id', (req, res) => {
    try {
      const actor = getActor(req);
      deleteBusiness(req.params.id);
      logActivity(actor, 'DELETE', 'business', req.params.id, `Removed business unit ${req.params.id}`);
      broadcast('business:updated', req.params.id);
      broadcast('activity:updated');
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // Inventory
  app.get('/api/inventory', (req, res) => {
    try {
      const businessId = typeof req.query.businessId === 'string' ? req.query.businessId : undefined;
      const category = typeof req.query.category === 'string' ? req.query.category : undefined;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const q = typeof req.query.q === 'string' ? req.query.q : undefined;
      res.json(getInventory({ businessId, category, status, q }));
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/inventory', (req, res) => {
    try {
      const actor = getActor(req);
      const item = createInventoryItem(req.body);
      logActivity(actor, 'CREATE', 'inventory', item.code, `Added equipment ${item.code} (${item.name})`);
      broadcast('inventory:updated', item.code);
      broadcast('activity:updated');
      res.status(201).json(item);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.patch('/api/inventory/:code', (req, res) => {
    try {
      const actor = getActor(req);
      const updated = updateInventoryItem(req.params.code, req.body);
      logActivity(actor, 'UPDATE', 'inventory', updated.code, `Edited ${updated.code} (${updated.name})`);
      broadcast('inventory:updated', updated.code);
      broadcast('activity:updated');
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.delete('/api/inventory/:code', (req, res) => {
    try {
      const actor = getActor(req);
      deleteInventoryItem(req.params.code);
      logActivity(actor, 'DELETE', 'inventory', req.params.code, `Deleted SKU ${req.params.code}`);
      broadcast('inventory:updated', req.params.code);
      broadcast('activity:updated');
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // Clients
  app.get('/api/clients', (_req, res) => {
    try {
      res.json(getClients());
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/clients', (req, res) => {
    try {
      if (!req.body?.name) {
        res.status(400).json({ error: 'Client name is required' });
        return;
      }
      const actor = getActor(req);
      const client = createClient(req.body);
      logActivity(actor, 'CREATE', 'client', String(client.id), `Added client ${client.name}`);
      broadcast('client:updated', String(client.id));
      broadcast('activity:updated');
      res.status(201).json(client);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.patch('/api/clients/:id', (req, res) => {
    try {
      const actor = getActor(req);
      const client = updateClient(Number(req.params.id), req.body);
      logActivity(actor, 'UPDATE', 'client', String(client.id), `Updated client ${client.name}`);
      broadcast('client:updated', String(client.id));
      broadcast('activity:updated');
      res.json(client);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.delete('/api/clients/:id', (req, res) => {
    try {
      const actor = getActor(req);
      deleteClient(Number(req.params.id));
      logActivity(actor, 'DELETE', 'client', req.params.id, `Removed client #${req.params.id}`);
      broadcast('client:updated', req.params.id);
      broadcast('activity:updated');
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // Quotes
  app.get('/api/quotes', (_req, res) => {
    try {
      res.json(getQuotes());
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/quotes', (req, res) => {
    try {
      const actor = getActor(req);
      const quote = createQuote(req.body);
      logActivity(actor, 'CREATE', 'quote', quote.quoteNo, `Created quotation ${quote.quoteNo} for ${quote.clientName}`);
      broadcast('quote:updated', quote.quoteNo);
      broadcast('client:updated');
      broadcast('activity:updated');
      res.status(201).json(quote);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.patch('/api/quotes/:id', (req, res) => {
    try {
      const actor = getActor(req);
      const quote = updateQuote(Number(req.params.id), req.body);
      logActivity(actor, 'UPDATE', 'quote', quote.quoteNo, `Edited quotation ${quote.quoteNo} (${quote.clientName})`);
      broadcast('quote:updated', quote.quoteNo);
      broadcast('activity:updated');
      res.json(quote);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.patch('/api/quotes/:id/status', (req, res) => {
    try {
      const actor = getActor(req);
      const quote = updateQuoteStatus(Number(req.params.id), req.body.status);
      logActivity(actor, 'STATUS', 'quote', quote.quoteNo, `Marked ${quote.quoteNo} as ${quote.status}`);
      broadcast('quote:updated', quote.quoteNo);
      broadcast('activity:updated');
      res.json(quote);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.delete('/api/quotes/:id', (req, res) => {
    try {
      const actor = getActor(req);
      deleteQuote(Number(req.params.id));
      logActivity(actor, 'DELETE', 'quote', req.params.id, `Deleted quotation #${req.params.id}`);
      broadcast('quote:updated', req.params.id);
      broadcast('activity:updated');
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // Shared Team Drafts
  app.get('/api/drafts', (_req, res) => {
    try {
      res.json(getSharedDrafts());
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/drafts', (req, res) => {
    try {
      const actor = getActor(req);
      const draft = createSharedDraft({ ...req.body, actorName: actor });
      logActivity(actor, 'CREATE', 'draft', String(draft.id), `Saved shared POS draft "${draft.title}"`);
      broadcast('draft:updated', String(draft.id));
      broadcast('activity:updated');
      res.status(201).json(draft);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.patch('/api/drafts/:id', (req, res) => {
    try {
      const actor = getActor(req);
      const draft = updateSharedDraft(Number(req.params.id), { ...req.body, actorName: actor });
      logActivity(actor, 'UPDATE', 'draft', String(draft.id), `Updated shared POS draft "${draft.title}"`);
      broadcast('draft:updated', String(draft.id));
      broadcast('activity:updated');
      res.json(draft);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.delete('/api/drafts/:id', (req, res) => {
    try {
      const actor = getActor(req);
      deleteSharedDraft(Number(req.params.id));
      logActivity(actor, 'DELETE', 'draft', req.params.id, `Removed shared draft #${req.params.id}`);
      broadcast('draft:updated', req.params.id);
      broadcast('activity:updated');
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // Rentals (Borrowers Slip + Delivery Receipt + Return Inspection)
  app.get('/api/rentals', (_req, res) => {
    try {
      res.json(getRentals());
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/rentals', (req, res) => {
    try {
      const actor = getActor(req);
      const rental = createRental({
        ...req.body,
        releasedBy: req.body.releasedBy || actor,
        isInternal: Boolean(req.body.isInternal),
      });
      logActivity(
        actor,
        rental.isInternal
          ? rental.status === 'DISPATCHED'
            ? 'ADMIN DISPATCH'
            : 'ADMIN RESERVE'
          : rental.status === 'DISPATCHED'
            ? 'DISPATCH'
            : 'RESERVE',
        'rental',
        rental.slipNo,
        rental.isInternal
          ? `Admin/Internal release ${rental.slipNo} for ${rental.eventPurpose || rental.borrowerName} (₱0 Own Gear)`
          : `${rental.status === 'DISPATCHED' ? 'Dispatched' : 'Reserved'} ${rental.slipNo} for ${rental.borrowerName}`
      );
      broadcast('rental:updated', rental.slipNo);
      broadcast('inventory:updated', rental.slipNo);
      if (!rental.isInternal) broadcast('client:updated');
      if (req.body.quoteId) broadcast('quote:updated');
      if (!rental.isInternal && Number(req.body.depositAdvance) > 0) broadcast('payment:updated');
      broadcast('activity:updated');
      res.status(201).json(rental);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.patch('/api/rentals/:id', (req, res) => {
    try {
      const actor = getActor(req);
      const rental = updateRental(Number(req.params.id), req.body);
      logActivity(actor, 'UPDATE', 'rental', rental.slipNo, `Edited rental details for ${rental.slipNo}`);
      broadcast('rental:updated', rental.slipNo);
      broadcast('activity:updated');
      res.json(rental);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/rentals/:id/dispatch', (req, res) => {
    try {
      const actor = getActor(req);
      const rental = dispatchReservedRental(
        Number(req.params.id),
        req.body.deliveryPersonnel,
        req.body.vehicleDriver
      );
      logActivity(actor, 'DISPATCH', 'rental', rental.slipNo, `Dispatched reserved slip ${rental.slipNo}`);
      broadcast('rental:updated', rental.slipNo);
      broadcast('inventory:updated', rental.slipNo);
      broadcast('activity:updated');
      res.json(rental);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/rentals/:id/cancel', (req, res) => {
    try {
      const actor = getActor(req);
      const rental = cancelReservedRental(Number(req.params.id));
      logActivity(actor, 'CANCEL', 'rental', rental.slipNo, `Cancelled reservation ${rental.slipNo}`);
      broadcast('rental:updated', rental.slipNo);
      broadcast('inventory:updated', rental.slipNo);
      broadcast('activity:updated');
      res.json(rental);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/rentals/:id/return', (req, res) => {
    try {
      const actor = getActor(req);
      const rental = processReturnInspection(Number(req.params.id), req.body);
      logActivity(
        actor,
        'RETURN',
        'rental',
        rental.slipNo,
        `Processed return inspection ${rental.returnNo} for ${rental.slipNo}`
      );
      broadcast('rental:updated', rental.slipNo);
      broadcast('inventory:updated', rental.slipNo);
      broadcast('maintenance:updated');
      broadcast('activity:updated');
      res.json(rental);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // Payments (FORM 0007)
  app.get('/api/payments', (_req, res) => {
    try {
      res.json(getPayments());
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/payments', (req, res) => {
    try {
      const actor = getActor(req);
      const payment = createPayment({ ...req.body, receivedBy: req.body.receivedBy || actor });
      logActivity(
        actor,
        'PAYMENT',
        'payment',
        payment.receiptNo,
        `Recorded payment ${payment.receiptNo} (₱${payment.amountPaid.toLocaleString()})`
      );
      broadcast('payment:updated', payment.receiptNo);
      broadcast('client:updated');
      if (req.body.rentalId) broadcast('rental:updated');
      broadcast('activity:updated');
      res.status(201).json(payment);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.patch('/api/payments/:id', (req, res) => {
    try {
      const actor = getActor(req);
      const payment = updatePayment(Number(req.params.id), req.body);
      logActivity(actor, 'UPDATE', 'payment', payment.receiptNo, `Updated payment receipt ${payment.receiptNo}`);
      broadcast('payment:updated', payment.receiptNo);
      broadcast('activity:updated');
      res.json(payment);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // Maintenance Slips (FORM 0002)
  app.get('/api/maintenance', (_req, res) => {
    try {
      res.json(getMaintenanceSlips());
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/maintenance', (req, res) => {
    try {
      const actor = getActor(req);
      const slip = createMaintenanceSlip({ ...req.body, requestedBy: req.body.requestedBy || actor });
      logActivity(actor, 'CREATE', 'maintenance', slip.slipNo, `Filed maintenance ${slip.slipNo} for ${slip.inventoryCode}`);
      broadcast('maintenance:updated', slip.slipNo);
      broadcast('inventory:updated', slip.inventoryCode);
      broadcast('activity:updated');
      res.status(201).json(slip);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.patch('/api/maintenance/:id', (req, res) => {
    try {
      const actor = getActor(req);
      const slip = updateMaintenanceSlip(Number(req.params.id), req.body);
      logActivity(actor, 'UPDATE', 'maintenance', slip.slipNo, `Updated maintenance ${slip.slipNo} (${slip.status})`);
      broadcast('maintenance:updated', slip.slipNo);
      broadcast('inventory:updated', slip.inventoryCode);
      broadcast('activity:updated');
      res.json(slip);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // Budget Requests (FORM 0003)
  app.get('/api/budgets', (_req, res) => {
    try {
      res.json(getBudgetRequests());
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/budgets', (req, res) => {
    try {
      const actor = getActor(req);
      const budget = createBudgetRequest({ ...req.body, requestedBy: req.body.requestedBy || actor });
      logActivity(actor, 'CREATE', 'budget', budget.budgetNo, `Submitted budget request ${budget.budgetNo}`);
      broadcast('budget:updated', budget.budgetNo);
      broadcast('activity:updated');
      res.status(201).json(budget);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.patch('/api/budgets/:id', (req, res) => {
    try {
      const actor = getActor(req);
      const budget = req.body.items || req.body.purpose !== undefined
        ? updateBudgetRequest(Number(req.params.id), req.body)
        : updateBudgetStatus(Number(req.params.id), req.body.status, req.body.actualSpent);
      logActivity(actor, 'UPDATE', 'budget', budget.budgetNo, `Updated budget ${budget.budgetNo} (${budget.status})`);
      broadcast('budget:updated', budget.budgetNo);
      broadcast('activity:updated');
      res.json(budget);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.delete('/api/budgets/:id', (req, res) => {
    try {
      const actor = getActor(req);
      deleteBudgetRequest(Number(req.params.id));
      logActivity(actor, 'DELETE', 'budget', req.params.id, `Deleted budget request #${req.params.id}`);
      broadcast('budget:updated', req.params.id);
      broadcast('activity:updated');
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // Database Backup & Restore
  app.get('/api/backup/export', (_req, res) => {
    try {
      const payload = exportFullBackup();
      const dateStamp = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="kr-oncue-backup-${dateStamp}.json"`);
      res.send(JSON.stringify(payload, null, 2));
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/backup/db', async (_req, res) => {
    const tmpFile = path.join(os.tmpdir(), `kr-oncue-${Date.now()}.db`);
    try {
      await createSqliteBackupCopy(tmpFile);
      const dateStamp = new Date().toISOString().slice(0, 10);
      res.download(tmpFile, `kr-oncue-${dateStamp}.db`, () => {
        fs.unlink(tmpFile, () => {});
      });
    } catch (err) {
      fs.unlink(tmpFile, () => {});
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/backup/restore', (req, res) => {
    try {
      const actor = getActor(req);
      restoreFullBackup(req.body);
      logActivity(actor, 'RESTORE', 'database', 'backup', 'Restored full database backup');
      broadcast('business:updated', 'restore');
      broadcast('inventory:updated', 'restore');
      broadcast('client:updated', 'restore');
      broadcast('quote:updated', 'restore');
      broadcast('rental:updated', 'restore');
      broadcast('payment:updated', 'restore');
      broadcast('maintenance:updated', 'restore');
      broadcast('budget:updated', 'restore');
      broadcast('draft:updated', 'restore');
      broadcast('activity:updated', 'restore');
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // Explicit Save to Main Server (Checkpoints & Restorable Server Savepoints)
  app.get('/api/server/saves', (_req, res) => {
    try {
      res.json(getServerSavepoints(30));
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/server/save', (req, res) => {
    try {
      const actor = getActor(req);
      const label = typeof req.body?.label === 'string' ? req.body.label : undefined;
      const savepoint = saveServerCheckpoint(actor, label);
      logActivity(
        actor,
        'SAVE',
        'server',
        String(savepoint.id),
        `Saved all data to main server (${savepoint.label})`
      );
      broadcast('server:saved', actor);
      broadcast('settings:updated', actor);
      broadcast('activity:updated', actor);
      res.status(201).json({ savepoint });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/server/saves/:id/download', (req, res) => {
    try {
      const { label, payloadJson } = getServerSavepointPayload(Number(req.params.id));
      const safeName = label.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '') || `save-${req.params.id}`;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="kr-oncue-${safeName}.json"`);
      res.send(payloadJson);
    } catch (err) {
      res.status(404).json({ error: (err as Error).message });
    }
  });

  app.post('/api/server/saves/:id/restore', (req, res) => {
    try {
      const actor = getActor(req);
      const restored = restoreServerSavepoint(Number(req.params.id));
      logActivity(
        actor,
        'RESTORE',
        'server',
        String(restored.id),
        `Restored server savepoint "${restored.label}"`
      );
      broadcast('business:updated', 'restore');
      broadcast('inventory:updated', 'restore');
      broadcast('client:updated', 'restore');
      broadcast('quote:updated', 'restore');
      broadcast('rental:updated', 'restore');
      broadcast('payment:updated', 'restore');
      broadcast('maintenance:updated', 'restore');
      broadcast('budget:updated', 'restore');
      broadcast('draft:updated', 'restore');
      broadcast('server:saved', actor);
      broadcast('activity:updated', 'restore');
      res.json({ ok: true, restored });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.delete('/api/server/saves/:id', (req, res) => {
    try {
      const actor = getActor(req);
      deleteServerSavepoint(Number(req.params.id));
      logActivity(actor, 'DELETE', 'server', req.params.id, `Removed server savepoint #${req.params.id}`);
      broadcast('server:saved', actor);
      broadcast('activity:updated', actor);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // Vite Dev Middleware or Static Prod Serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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
