import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ActivityLogEntry,
  BudgetRequest,
  BusinessUnit,
  Client,
  DashboardSummary,
  InventoryItem,
  MaintenanceSlip,
  Payment,
  PresenceMember,
  Quote,
  RealtimeMessage,
  Rental,
  ServerInfo,
  ServerSavepoint,
  ServerUser,
  SharedDraft,
  SyncStateResponse,
} from '../types';
import type { OperatorProfile } from '../utils/api';

export type WsStatus = 'connected' | 'connecting' | 'disconnected';

export function useRealtimePOS(
  operator: OperatorProfile,
  activeView: string,
  editingKey: string | null
) {
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [businesses, setBusinesses] = useState<BusinessUnit[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceSlip[]>([]);
  const [budgets, setBudgets] = useState<BudgetRequest[]>([]);
  const [drafts, setDrafts] = useState<SharedDraft[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [serverSaves, setServerSaves] = useState<ServerSavepoint[]>([]);
  const [serverUsers, setServerUsers] = useState<ServerUser[]>([]);
  const [onlineMembers, setOnlineMembers] = useState<PresenceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [wsStatus, setWsStatus] = useState<WsStatus>('connecting');
  const [lastSyncAt, setLastSyncAt] = useState<string>('');
  const [realtimeMode, setRealtimeMode] = useState<'ws' | 'polling' | null>(null);
  const [lastRemoteEvent, setLastRemoteEvent] = useState<{
    actor: string;
    summary: string;
    type: string;
    timestamp: string;
  } | null>(null);

  const lastRevisionRef = useRef<number>(0);
  const presenceRef = useRef({ operator, activeView, editingKey });
  presenceRef.current = { operator, activeView, editingKey };

  const fetchAll = useCallback(async () => {
    try {
      const [
        dashRes,
        bizRes,
        invRes,
        cliRes,
        qtRes,
        rentRes,
        payRes,
        maintRes,
        budRes,
        draftRes,
        actRes,
        srvRes,
        savesRes,
        usersRes,
      ] = await Promise.all([
        fetch('/api/dashboard'),
        fetch('/api/businesses'),
        fetch('/api/inventory'),
        fetch('/api/clients'),
        fetch('/api/quotes'),
        fetch('/api/rentals'),
        fetch('/api/payments'),
        fetch('/api/maintenance'),
        fetch('/api/budgets'),
        fetch('/api/drafts'),
        fetch('/api/activity'),
        fetch('/api/server-info'),
        fetch('/api/server/saves'),
        fetch('/api/server-users'),
      ]);

      if (dashRes.ok) setDashboard(await dashRes.json());
      if (bizRes.ok) setBusinesses(await bizRes.json());
      if (invRes.ok) setInventory(await invRes.json());
      if (cliRes.ok) setClients(await cliRes.json());
      if (qtRes.ok) setQuotes(await qtRes.json());
      if (rentRes.ok) setRentals(await rentRes.json());
      if (payRes.ok) setPayments(await payRes.json());
      if (maintRes.ok) setMaintenance(await maintRes.json());
      if (budRes.ok) setBudgets(await budRes.json());
      if (draftRes.ok) setDrafts(await draftRes.json());
      if (actRes.ok) setActivityLog(await actRes.json());
      if (srvRes.ok) {
        const srv = (await srvRes.json()) as ServerInfo;
        setServerInfo(srv);
        if (srv.revision) {
          lastRevisionRef.current = Math.max(lastRevisionRef.current, srv.revision);
        }
        if (srv.onlineMembers) setOnlineMembers(srv.onlineMembers);
        if (srv.realtimeMode) {
          setRealtimeMode((prev) => prev ?? srv.realtimeMode ?? 'ws');
        }
      }
      if (savesRes.ok) setServerSaves(await savesRes.json());
      if (usersRes.ok) setServerUsers(await usersRes.json());
      setLastSyncAt(new Date().toISOString());
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchScope = useCallback(async (type: RealtimeMessage['type']) => {
    try {
      const dashPromise = fetch('/api/dashboard').then((r) => (r.ok ? r.json() : null));
      let scopePromise: Promise<void> = Promise.resolve();

      if (type === 'inventory:updated') {
        scopePromise = fetch('/api/inventory')
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data) setInventory(data);
          });
      } else if (type === 'client:updated') {
        scopePromise = fetch('/api/clients')
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data) setClients(data);
          });
      } else if (type === 'quote:updated') {
        scopePromise = fetch('/api/quotes')
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data) setQuotes(data);
          });
      } else if (type === 'rental:updated') {
        scopePromise = fetch('/api/rentals')
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data) setRentals(data);
          });
      } else if (type === 'payment:updated') {
        scopePromise = fetch('/api/payments')
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data) setPayments(data);
          });
      } else if (type === 'maintenance:updated') {
        scopePromise = fetch('/api/maintenance')
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data) setMaintenance(data);
          });
      } else if (type === 'budget:updated') {
        scopePromise = fetch('/api/budgets')
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data) setBudgets(data);
          });
      } else if (type === 'draft:updated') {
        scopePromise = fetch('/api/drafts')
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data) setDrafts(data);
          });
      } else if (type === 'activity:updated') {
        scopePromise = Promise.all([
          fetch('/api/activity').then((r) => (r.ok ? r.json() : null)),
          fetch('/api/server-info').then((r) => (r.ok ? r.json() : null)),
        ]).then(([actData, srvData]) => {
          if (actData) setActivityLog(actData);
          if (srvData) setServerInfo(srvData);
        });
      } else if (type === 'settings:updated') {
        scopePromise = fetch('/api/server-info')
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data) setServerInfo(data);
          });
      } else if (type === 'server:saved') {
        scopePromise = Promise.all([
          fetch('/api/server/saves').then((r) => (r.ok ? r.json() : null)),
          fetch('/api/server-info').then((r) => (r.ok ? r.json() : null)),
        ]).then(([savesData, srvData]) => {
          if (savesData) setServerSaves(savesData);
          if (srvData) setServerInfo(srvData);
        });
      } else if (type === 'users:updated') {
        scopePromise = Promise.all([
          fetch('/api/server-users').then((r) => (r.ok ? r.json() : null)),
          fetch('/api/server-info').then((r) => (r.ok ? r.json() : null)),
        ]).then(([usersData, srvData]) => {
          if (usersData) setServerUsers(usersData);
          if (srvData) {
            setServerInfo(srvData);
            if (srvData.onlineMembers) setOnlineMembers(srvData.onlineMembers);
          }
        });
      } else if (type === 'business:updated') {
        scopePromise = fetch('/api/businesses')
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data) setBusinesses(data);
          });
      }

      const [dashData] = await Promise.all([dashPromise, scopePromise]);
      if (dashData) setDashboard(dashData);
      if (type !== 'activity:updated' && type !== 'presence:updated') {
        void fetch('/api/activity')
          .then((r) => (r.ok ? r.json() : null))
          .then((act) => {
            if (act) setActivityLog(act);
          })
          .catch(() => {});
      }
      setLastSyncAt(new Date().toISOString());
    } catch {
      // Ignore transient network errors; next sync will refresh
    }
  }, []);

  const pollSyncState = useCallback(async () => {
    try {
      const res = await fetch('/api/sync-state');
      if (!res.ok) return;
      const state = (await res.json()) as SyncStateResponse;
      if (state.onlineMembers) setOnlineMembers(state.onlineMembers);
      if (state.serverUsers) setServerUsers(state.serverUsers);
      if (state.revision && state.revision !== lastRevisionRef.current) {
        const hadRevision = lastRevisionRef.current > 0;
        lastRevisionRef.current = state.revision;
        if (
          hadRevision &&
          state.lastEvent &&
          state.lastEvent.actor &&
          state.lastEvent.actor !== presenceRef.current.operator.name
        ) {
          setLastRemoteEvent({
            actor: state.lastEvent.actor,
            summary: state.lastEvent.detail || state.lastEvent.type.replace(':updated', ' updated'),
            type: state.lastEvent.type,
            timestamp: state.lastEvent.timestamp,
          });
        }
        await fetchAll();
      }
    } catch {
      // ignore transient sync poll errors
    }
  }, [fetchAll]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const prevProfileKeyRef = useRef<string>('');

  const sendPresenceHttp = useCallback(async (forceSyncProfile = false) => {
    try {
      const { operator: op, activeView: view, editingKey: editKey } = presenceRef.current;
      if (!op.serverUserId && !op.name.trim()) return;
      const profileKey = `${op.clientId}|${op.serverUserId ?? ''}|${op.name}|${op.role}|${op.color}`;
      const changed = Boolean(prevProfileKeyRef.current && prevProfileKeyRef.current !== profileKey);
      prevProfileKeyRef.current = profileKey;

      const res = await fetch('/api/presence', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Id': op.deviceId,
          'X-Device-Name': op.deviceName,
        },
        body: JSON.stringify({
          clientId: op.clientId,
          deviceId: op.deviceId,
          deviceName: op.deviceName,
          serverUserId: op.serverUserId ?? null,
          name: op.name,
          role: op.role,
          color: op.color,
          syncProfile: forceSyncProfile || changed,
          activeView: view,
          editingKey: editKey,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { members?: PresenceMember[]; serverUsers?: ServerUser[] };
        if (data.members) setOnlineMembers(data.members);
        if (data.serverUsers) setServerUsers(data.serverUsers);
        if (realtimeMode === 'polling') {
          setWsStatus('connected');
        }
      }
    } catch {
      // ignore transient polling presence errors
    }
  }, [realtimeMode]);

  const sendPresence = useCallback(
    (forceSyncProfile = false) => {
      const { operator: op, activeView: view, editingKey: editKey } = presenceRef.current;
      if (!op.serverUserId && !op.name.trim()) return;
      if (realtimeMode === 'polling') {
        void sendPresenceHttp(forceSyncProfile);
        return;
      }
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        void sendPresenceHttp(forceSyncProfile);
        return;
      }
      const profileKey = `${op.clientId}|${op.serverUserId ?? ''}|${op.name}|${op.role}|${op.color}`;
      const changed = Boolean(prevProfileKeyRef.current && prevProfileKeyRef.current !== profileKey);
      prevProfileKeyRef.current = profileKey;

      ws.send(
        JSON.stringify({
          kind: 'presence',
          clientId: op.clientId,
          deviceId: op.deviceId,
          deviceName: op.deviceName,
          serverUserId: op.serverUserId ?? null,
          name: op.name,
          role: op.role,
          color: op.color,
          syncProfile: forceSyncProfile || changed,
          activeView: view,
          editingKey: editKey,
        })
      );
    },
    [realtimeMode, sendPresenceHttp]
  );

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    sendPresence(false);
  }, [
    operator.clientId,
    operator.deviceId,
    operator.deviceName,
    operator.serverUserId,
    operator.name,
    operator.role,
    operator.color,
    activeView,
    editingKey,
    sendPresence,
  ]);

  useEffect(() => {
    if (!realtimeMode) return;

    let unmounted = false;

    if (realtimeMode === 'polling') {
      setWsStatus('connected');
      void sendPresenceHttp(false);

      const syncTimer = window.setInterval(() => {
        if (!unmounted && !document.hidden) {
          void pollSyncState();
        }
      }, 3500);

      const presenceTimer = window.setInterval(() => {
        if (!unmounted && !document.hidden) {
          void sendPresenceHttp(false);
        }
      }, 15000);

      const handleWake = () => {
        if (unmounted || document.hidden) return;
        void sendPresenceHttp(false);
        void pollSyncState();
      };

      document.addEventListener('visibilitychange', handleWake);
      window.addEventListener('pageshow', handleWake);
      window.addEventListener('online', handleWake);

      return () => {
        unmounted = true;
        clearInterval(syncTimer);
        clearInterval(presenceTimer);
        document.removeEventListener('visibilitychange', handleWake);
        window.removeEventListener('pageshow', handleWake);
        window.removeEventListener('online', handleWake);
      };
    }

    let heartbeatTimer: number | null = null;
    let fallbackSyncTimer: number | null = null;

    const connect = () => {
      if (unmounted) return;
      if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
        return;
      }
      setWsStatus('connecting');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!unmounted) {
          setWsStatus('connected');
          sendPresence(false);
          fetchAll();
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as RealtimeMessage;
          if (msg.type === 'presence:updated') {
            if (msg.detail === 'pong') return;
            if (msg.members) {
              setOnlineMembers(msg.members);
              setServerUsers((prev) =>
                prev.map((u) => {
                  const live = msg.members!.find(
                    (m) => (m.serverUserId && m.serverUserId === u.id) || m.clientId === u.clientId
                  );
                  return {
                    ...u,
                    isOnline: Boolean(live),
                    activeView: live?.activeView ?? u.activeView ?? undefined,
                    editingKey: live?.editingKey ?? null,
                    deviceId: live?.deviceId ?? u.deviceId,
                    deviceName: live?.deviceName ?? u.deviceName,
                    deviceIp: live?.deviceIp ?? u.deviceIp,
                    lastSeenAt: live?.lastSeenAt ?? u.lastSeenAt,
                  };
                })
              );
            }
            return;
          }
          if (msg.revision) {
            lastRevisionRef.current = Math.max(lastRevisionRef.current, msg.revision);
          }
          if (
            msg.type !== 'activity:updated' &&
            msg.actor &&
            msg.actor !== presenceRef.current.operator.name
          ) {
            setLastRemoteEvent({
              actor: msg.actor,
              summary: msg.detail || msg.type.replace(':updated', ' updated'),
              type: msg.type,
              timestamp: msg.timestamp,
            });
          }
          if (msg.detail !== 'connected') {
            fetchScope(msg.type);
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        if (!unmounted) {
          setWsStatus('disconnected');
          reconnectTimerRef.current = window.setTimeout(connect, 2500);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    // Fast revision & presence sync fallback so edits always appear on every online device even if WS is throttled
    fallbackSyncTimer = window.setInterval(() => {
      if (!unmounted && !document.hidden) {
        void pollSyncState();
      }
    }, 3500);

    // Keep Safari / iOS mobile WebSockets alive and fall back to HTTP presence when needed
    heartbeatTimer = window.setInterval(() => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ kind: 'ping' }));
        } catch {
          ws.close();
        }
      } else {
        void sendPresenceHttp(false);
        if (!document.hidden) {
          connect();
        }
      }
    }, 25000);

    // Re-sync and wake WebSocket immediately when returning from iOS background / macOS sleep / Safari bfcache
    const handleWake = () => {
      if (unmounted || document.hidden) return;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        connect();
      } else {
        sendPresence(false);
      }
      void pollSyncState();
    };

    document.addEventListener('visibilitychange', handleWake);
    window.addEventListener('pageshow', handleWake);
    window.addEventListener('online', handleWake);

    return () => {
      unmounted = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (fallbackSyncTimer) clearInterval(fallbackSyncTimer);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      document.removeEventListener('visibilitychange', handleWake);
      window.removeEventListener('pageshow', handleWake);
      window.removeEventListener('online', handleWake);
      wsRef.current?.close();
    };
  }, [realtimeMode, fetchAll, fetchScope, pollSyncState, sendPresence, sendPresenceHttp]);

  return {
    dashboard,
    businesses,
    inventory,
    clients,
    quotes,
    rentals,
    payments,
    maintenance,
    budgets,
    drafts,
    activityLog,
    serverInfo,
    serverSaves,
    serverUsers,
    onlineMembers,
    loading,
    wsStatus,
    lastSyncAt,
    lastRemoteEvent,
    refresh: fetchAll,
  };
}
