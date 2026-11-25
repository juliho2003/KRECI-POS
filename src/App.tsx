import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  Check,
  ClipboardList,
  FileSpreadsheet,
  LayoutDashboard,
  Lock,
  Menu,
  Receipt,
  RefreshCw,
  Save,
  Server,
  Share2,
  ShieldCheck,
  ShoppingCart,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { AdminView } from './components/AdminView';
import { ClientsView } from './components/ClientsView';
import { DashboardView } from './components/DashboardView';
import { InventoryView } from './components/InventoryView';
import { PosTerminalView } from './components/PosTerminalView';
import { PrintableFormModal, type PrintablePayload } from './components/PrintableFormModal';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';
import { QuotesView } from './components/QuotesView';
import { RentalsView } from './components/RentalsView';
import { SlipsAndFinanceView } from './components/SlipsAndFinanceView';
import { TeamServerView } from './components/TeamServerView';
import { useRealtimePOS } from './hooks/useRealtimePOS';
import type { EquipmentCategoryCode, ServerUser } from './types';
import {
  apiFetch,
  getOperatorProfile,
  getStoredTeamPin,
  registerPinPromptHandler,
  saveOperatorProfile,
  setStoredTeamPin,
  type OperatorProfile,
} from './utils/api';
import { formatPeso } from './utils/format';

type WorkspaceView = 'dashboard' | 'pos' | 'inventory' | 'quotes' | 'rentals' | 'admin' | 'clients' | 'finance' | 'team';

const NAV_ITEMS: Array<{ id: WorkspaceView; label: string; icon: typeof ShoppingCart }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'pos', label: 'POS Terminal', icon: ShoppingCart },
  { id: 'inventory', label: 'Master Inventory', icon: Boxes },
  { id: 'quotes', label: 'Quotations', icon: FileSpreadsheet },
  { id: 'rentals', label: 'Rentals & Returns', icon: ClipboardList },
  { id: 'admin', label: 'Admin & Own Gear', icon: ShieldCheck },
  { id: 'clients', label: 'Clients', icon: Users },
  { id: 'finance', label: 'Finance & Slips', icon: Receipt },
  { id: 'team', label: 'Team Server & Share', icon: Server },
];

const OPERATOR_COLORS = ['#d97706', '#0284c7', '#059669', '#7c3aed', '#dc2626', '#db2777', '#0d9488'];

export default function App() {
  const [activeView, setActiveView] = useState<WorkspaceView>('dashboard');
  const [activeBusinessId, setActiveBusinessId] = useState<string>('kr-oncue');
  const [invBusinessFilter, setInvBusinessFilter] = useState<string>('ALL');
  const [invCategoryFilter, setInvCategoryFilter] = useState<'ALL' | EquipmentCategoryCode>('ALL');
  const [openAddOtherSignal, setOpenAddOtherSignal] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [printPayload, setPrintPayload] = useState<PrintablePayload | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const [operator, setOperator] = useState<OperatorProfile>(() => getOperatorProfile());
  const [editingKey, setEditingKey] = useState<string | null>(null);

  // Operator Profile modal state
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [opNameInput, setOpNameInput] = useState(operator.name);
  const [opRoleInput, setOpRoleInput] = useState(operator.role);
  const [opColorInput, setOpColorInput] = useState(operator.color);

  // Team Edit PIN prompt modal state
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState(() => getStoredTeamPin());
  const [verifyingPin, setVerifyingPin] = useState(false);
  const [savingToServer, setSavingToServer] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const {
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
    refresh,
  } = useRealtimePOS(operator, activeView, editingKey);

  const currentServerUser = serverUsers.find(
    (u) => (operator.serverUserId ? u.id === operator.serverUserId : false) || u.clientId === operator.clientId
  );

  const lastSyncedUserRef = useRef<string>('');

  const notify = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    window.setTimeout(() => {
      setToast((curr) => (curr?.msg === msg ? null : curr));
    }, 4500);
  };

  useEffect(() => {
    return registerPinPromptHandler(() => {
      setShowPinModal(true);
    });
  }, []);

  // Resolve personal shared server invite links (?invite=TOKEN)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inviteToken = params.get('invite');
    if (!inviteToken) return;

    const cleanUrl = window.location.pathname + (window.location.hash || '');
    window.history.replaceState({}, '', cleanUrl);

    fetch(`/api/server-users/resolve?invite=${encodeURIComponent(inviteToken)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Invalid invite link');
        return data as ServerUser;
      })
      .then((user) => {
        const nextOp: OperatorProfile = {
          clientId: user.clientId,
          serverUserId: user.id,
          inviteToken: user.inviteToken,
          name: user.name,
          role: user.role,
          color: user.color,
        };
        lastSyncedUserRef.current = `${user.id}|${user.name}|${user.role}|${user.color}|${user.inviteToken}`;
        saveOperatorProfile(nextOp);
        setOperator(nextOp);
        notify(`Signed in via shared server link as ${user.name} (${user.accessLevel}).`);
        refresh();
      })
      .catch((err) => {
        notify((err as Error).message, 'error');
      });
  }, [refresh]);

  // Keep local operator linked with live DB ServerUser updates
  useEffect(() => {
    if (!currentServerUser) return;
    const snapshot = `${currentServerUser.id}|${currentServerUser.name}|${currentServerUser.role}|${currentServerUser.color}|${currentServerUser.inviteToken}`;
    if (lastSyncedUserRef.current === snapshot) return;
    lastSyncedUserRef.current = snapshot;

    const nextOp: OperatorProfile = {
      clientId: operator.clientId || currentServerUser.clientId,
      serverUserId: currentServerUser.id,
      inviteToken: currentServerUser.inviteToken,
      name: currentServerUser.name,
      role: currentServerUser.role,
      color: currentServerUser.color,
    };
    saveOperatorProfile(nextOp);
    setOperator(nextOp);
  }, [currentServerUser, operator.clientId]);

  const handleSwitchServerUser = (u: ServerUser) => {
    const nextOp: OperatorProfile = {
      clientId: u.clientId,
      serverUserId: u.id,
      inviteToken: u.inviteToken,
      name: u.name,
      role: u.role,
      color: u.color,
    };
    lastSyncedUserRef.current = `${u.id}|${u.name}|${u.role}|${u.color}|${u.inviteToken}`;
    saveOperatorProfile(nextOp);
    setOperator(nextOp);
    setOpNameInput(u.name);
    setOpRoleInput(u.role);
    setOpColorInput(u.color);
    setShowProfileModal(false);
    notify(`Switched active server user to ${u.name} (${u.accessLevel}).`);
  };

  const handleSaveProfile = async () => {
    if (!opNameInput.trim()) {
      notify('Operator name cannot be empty.', 'error');
      return;
    }
    const updated: OperatorProfile = {
      ...operator,
      name: opNameInput.trim(),
      role: opRoleInput.trim() || 'Team Member',
      color: opColorInput,
    };
    saveOperatorProfile(updated);
    setOperator(updated);
    if (currentServerUser && currentServerUser.status === 'ACTIVE' && currentServerUser.canEdit) {
      lastSyncedUserRef.current = `${currentServerUser.id}|${updated.name}|${updated.role}|${updated.color}|${currentServerUser.inviteToken}`;
      try {
        await apiFetch(`/api/server-users/${currentServerUser.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: updated.name,
            role: updated.role,
            color: updated.color,
          }),
        });
      } catch {
        // WS presence syncs too
      }
    }
    setShowProfileModal(false);
    notify(`Signed in as ${updated.name} (${updated.role}).`);
  };

  const handleVerifyPin = async () => {
    setVerifyingPin(true);
    try {
      const res = await fetch('/api/auth/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Incorrect Team Edit PIN');
      }
      setStoredTeamPin(pinInput.trim());
      setShowPinModal(false);
      notify('Device unlocked for team editing.');
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setVerifyingPin(false);
    }
  };

  const handleSaveToServer = async (label?: string) => {
    setSavingToServer(true);
    try {
      const res = await apiFetch('/api/server/save', {
        method: 'POST',
        body: JSON.stringify({ label }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save data to server');
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 3000);
      notify(`Saved all team data to main server (${data.savepoint.label}).`);
      refresh();
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setSavingToServer(false);
    }
  };

  const activeNavLabel = NAV_ITEMS.find((n) => n.id === activeView)?.label ?? 'Dashboard';

  const handleOpenBusinessPos = (businessId: string) => {
    setActiveBusinessId(businessId);
    setEditingKey(null);
    setActiveView('pos');
  };

  const handleOpenBusinessInventory = (
    businessId: string,
    category: 'ALL' | EquipmentCategoryCode = 'ALL'
  ) => {
    setInvBusinessFilter(businessId);
    setInvCategoryFilter(category);
    setEditingKey(null);
    setActiveView('inventory');
  };

  const handleOpenAddOtherEquipment = () => {
    setInvBusinessFilter(activeBusinessId);
    setInvCategoryFilter('ALL');
    setOpenAddOtherSignal((n) => n + 1);
    setEditingKey(null);
    setActiveView('inventory');
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex">
      {/* Sidebar Navigation */}
      <aside
        className={`no-print fixed inset-y-0 left-0 z-40 w-64 bg-[#0f172a] text-slate-100 flex flex-col justify-between transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          <div className="flex items-center justify-between gap-2.5 px-4 py-4 border-b border-slate-800">
            <img
              src="/assets/aistudio/image_022d529a.png"
              alt="KULTURE REVIVAL EVENTS CORE, INC. Official Logo"
              className="h-11 w-11 shrink-0 object-contain bg-white p-0.5 border border-slate-700"
            />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-extrabold tracking-tight leading-tight text-white">KULTURE REVIVAL EVENTS CORE, INC.</div>
              <div className="text-[11px] font-medium text-amber-400">
                POS System
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              className="lg:hidden text-slate-400 hover:text-white cursor-pointer shrink-0"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="p-3 space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveView(item.id);
                    setEditingKey(null);
                    setMobileNavOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-amber-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </span>
                  {(item.id === 'team' && (serverUsers.length > 0 || onlineMembers.length > 0)) && (
                    <span className="text-[10px] font-mono bg-slate-800 text-emerald-300 px-1.5 py-0.5">
                      {serverUsers.length > 0
                        ? `${serverUsers.filter((u) => u.isOnline).length}/${serverUsers.length} live`
                        : `${onlineMembers.length} live`}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Real WebSocket & Server Footer */}
        <div className="p-4 border-t border-slate-800 text-xs space-y-2">
          <button
            type="button"
            onClick={() => {
              setOpNameInput(operator.name);
              setOpRoleInput(operator.role);
              setOpColorInput(operator.color);
              setShowProfileModal(true);
            }}
            className="w-full flex items-center gap-2.5 p-2 bg-slate-800/80 hover:bg-slate-800 text-left transition-colors cursor-pointer"
          >
            <span
              className="h-6 w-6 shrink-0 flex items-center justify-center text-[11px] font-bold text-white"
              style={{ backgroundColor: operator.color }}
            >
              {operator.name.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-white truncate">{operator.name}</div>
              <div className="text-[10px] text-slate-400 truncate">{operator.role} · Edit Name</div>
            </div>
          </button>

          <div className="flex items-center justify-between text-slate-300">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  wsStatus === 'connected'
                    ? 'bg-emerald-400'
                    : wsStatus === 'connecting'
                      ? 'bg-amber-400'
                      : 'bg-red-500'
                }`}
              />
              <span>
                {wsStatus === 'connected'
                  ? serverInfo?.runtime === 'netlify'
                    ? 'Cloud Sync Active'
                    : 'Server Sync Active'
                  : wsStatus === 'connecting'
                    ? 'Connecting Sync...'
                    : 'Sync Disconnected'}
              </span>
            </div>
            <button
              type="button"
              onClick={refresh}
              className="text-slate-400 hover:text-white p-1 cursor-pointer"
              title="Refresh data from server"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="text-[11px] text-slate-500">
            KULTURE REVIVAL EVENTS CORE, INC. · {serverInfo?.runtime === 'netlify' ? 'Netlify Cloud Persisted' : 'SQLite Persisted'}
          </div>
          {serverInfo?.lastManualSaveAt && (
            <div className="text-[10px] text-emerald-400/90 truncate" title={`Saved by ${serverInfo.lastManualSaveBy}`}>
              Saved: {serverInfo.lastManualSaveBy} · {new Date(serverInfo.lastManualSaveAt).toLocaleTimeString()}
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar */}
        <header className="no-print sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-1.5 text-slate-600 hover:text-slate-900 border border-slate-200 cursor-pointer"
            >
              <Menu className="h-4 w-4" />
            </button>
            <img
              src="/assets/aistudio/image_022d529a.png"
              alt="KULTURE REVIVAL EVENTS CORE, INC."
              className="h-7 w-7 shrink-0 object-contain bg-white border border-slate-200 p-0.5"
            />
            <div className="text-sm font-semibold text-slate-900 truncate">
              <span className="hidden sm:inline text-slate-400 font-normal">KULTURE REVIVAL EVENTS CORE, INC. / </span>
              {activeNavLabel}
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {/* Online Server Users Presence Strip */}
            <button
              type="button"
              onClick={() => setActiveView('team')}
              title="View live server users and share links"
              className="hidden sm:inline-flex items-center gap-2 border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs hover:bg-slate-100 cursor-pointer"
            >
              <div className="flex -space-x-1.5">
                {onlineMembers.slice(0, 4).map((m) => (
                  <span
                    key={m.clientId}
                    className="h-5 w-5 flex items-center justify-center text-[9px] font-bold text-white ring-1 ring-white"
                    style={{ backgroundColor: m.color }}
                    title={`${m.name} (${m.role})`}
                  >
                    {m.name.slice(0, 2).toUpperCase()}
                  </span>
                ))}
              </div>
              <span className="font-medium text-slate-700">
                {serverUsers.length > 0
                  ? `${serverUsers.filter((u) => u.isOnline).length}/${serverUsers.length} users live`
                  : `${onlineMembers.length} ${onlineMembers.length === 1 ? 'device' : 'devices'} online`}
              </span>
            </button>

            {/* Current Operator Badge */}
            <button
              type="button"
              onClick={() => {
                setOpNameInput(operator.name);
                setOpRoleInput(operator.role);
                setOpColorInput(operator.color);
                setShowProfileModal(true);
              }}
              className="inline-flex items-center gap-1.5 border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer"
              title="Switch operator name"
            >
              <UserCheck className="h-3.5 w-3.5 text-amber-600" />
              <span className="hidden md:inline">{operator.name}</span>
            </button>

            {serverInfo?.teamPinEnabled && (
              <button
                type="button"
                onClick={() => setShowPinModal(true)}
                className="inline-flex items-center gap-1 border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 cursor-pointer"
                title="Enter Team Edit PIN"
              >
                <Lock className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">PIN Active</span>
              </button>
            )}

            <button
              type="button"
              disabled={savingToServer}
              onClick={() => handleSaveToServer()}
              title={
                serverInfo?.lastManualSaveAt
                  ? `Last saved by ${serverInfo.lastManualSaveBy} on ${new Date(serverInfo.lastManualSaveAt).toLocaleString()}`
                  : 'Save and checkpoint all data to the main server'
              }
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60 ${
                justSaved ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-emerald-700 hover:bg-emerald-800'
              }`}
            >
              {justSaved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
              <span>
                {savingToServer
                  ? 'Saving...'
                  : justSaved
                    ? 'Saved to Server'
                    : 'Save to Server'}
              </span>
            </button>

            {activeView !== 'team' && (
              <button
                type="button"
                onClick={() => setActiveView('team')}
                className="inline-flex items-center gap-1.5 border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap cursor-pointer"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Share Server</span>
              </button>
            )}

            <PWAInstallButton />

            {activeView !== 'pos' && (
              <button
                type="button"
                onClick={() => setActiveView('pos')}
                className="bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
              >
                New POS Order
              </button>
            )}
          </div>
        </header>

        {/* Live Access Restriction Banner (Revoked / View-Only) */}
        {currentServerUser &&
          (currentServerUser.status === 'REVOKED' ||
            !currentServerUser.canEdit ||
            currentServerUser.accessLevel === 'VIEWER') && (
            <div
              className={`no-print border-b px-4 sm:px-6 py-2 text-xs flex items-center justify-between gap-3 ${
                currentServerUser.status === 'REVOKED'
                  ? 'bg-red-50 border-red-200 text-red-900'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  {currentServerUser.status === 'REVOKED'
                    ? `Access Revoked for ${currentServerUser.name} — You can view cached data, but server edits are disabled by the owner.`
                    : `View-Only Access (${currentServerUser.name}) — You receive real-time updates, but editing/saving requires EDITOR permission.`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveView('team')}
                className="underline font-semibold shrink-0 cursor-pointer"
              >
                View Server Users
              </button>
            </div>
          )}

        {/* Live Operational KPI Strip */}
        <div className="no-print border-b border-slate-200 bg-white px-4 sm:px-6 py-3">
          {loading || !dashboard ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="h-11 bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-xs">
              <div>
                <div className="text-slate-500">Available / On Hand</div>
                <div className="mt-0.5 font-mono text-base font-bold tabular-nums text-slate-900">
                  {dashboard.totalUnitsAvailable}
                  <span className="text-xs font-normal text-slate-400"> / {dashboard.totalUnitsOnHand}</span>
                </div>
              </div>
              <div>
                <div className="text-slate-500">Units Out / Reserved</div>
                <div className="mt-0.5 font-mono text-base font-bold tabular-nums text-sky-700">
                  {dashboard.totalUnitsOut}
                </div>
              </div>
              <div>
                <div className="text-slate-500">In Maintenance</div>
                <div className="mt-0.5 font-mono text-base font-bold tabular-nums text-red-700">
                  {dashboard.maintenanceCount}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Active Slips</div>
                <div className="mt-0.5 font-mono text-base font-bold tabular-nums text-slate-900">
                  {dashboard.activeRentalsCount}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Open Quotes</div>
                <div className="mt-0.5 font-mono text-base font-bold tabular-nums text-amber-700">
                  {dashboard.pendingQuotesCount}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Collected / Receivables</div>
                <div className="mt-0.5 font-mono text-sm font-bold tabular-nums text-emerald-700">
                  {formatPeso(dashboard.totalRevenueCollected)}
                  <span className="block text-[11px] font-medium text-amber-700">
                    Due: {formatPeso(dashboard.outstandingReceivables)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Toast Feedback */}
        {toast && (
          <div className="no-print fixed bottom-5 right-5 z-50 max-w-sm border px-4 py-3 text-xs font-medium shadow-md bg-white border-slate-300 text-slate-900">
            <div className="flex items-center justify-between gap-3">
              <span className={toast.type === 'error' ? 'text-red-700 font-semibold' : 'text-emerald-700 font-semibold'}>
                {toast.msg}
              </span>
              <button
                type="button"
                onClick={() => setToast(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Active Workspace Viewport */}
        <main className="no-print flex-1 p-4 sm:p-6">
          {activeView === 'dashboard' && (
            <DashboardView
              dashboard={dashboard}
              businesses={businesses}
              quotes={quotes}
              rentals={rentals}
              payments={payments}
              onOpenBusinessPos={handleOpenBusinessPos}
              onOpenBusinessInventory={handleOpenBusinessInventory}
              onOpenPrint={setPrintPayload}
              onNotify={notify}
              onRefresh={refresh}
            />
          )}

          {activeView === 'pos' && (
            <PosTerminalView
              inventory={inventory}
              businesses={businesses}
              clients={clients}
              drafts={drafts}
              activeBusinessId={activeBusinessId}
              onChangeBusiness={setActiveBusinessId}
              onOpenInventoryAddOther={handleOpenAddOtherEquipment}
              onNotify={notify}
              onOpenPrint={setPrintPayload}
              onTransactionDone={refresh}
            />
          )}

          {activeView === 'inventory' && (
            <InventoryView
              inventory={inventory}
              businesses={businesses}
              dashboard={dashboard}
              onlineMembers={onlineMembers}
              currentClientId={operator.clientId}
              businessFilter={invBusinessFilter}
              categoryFilter={invCategoryFilter}
              openAddOtherSignal={openAddOtherSignal}
              onBusinessFilterChange={setInvBusinessFilter}
              onCategoryFilterChange={setInvCategoryFilter}
              onEditingChange={setEditingKey}
              onNotify={notify}
              onOpenPrint={setPrintPayload}
              onRefresh={refresh}
            />
          )}

          {activeView === 'quotes' && (
            <QuotesView
              quotes={quotes}
              businesses={businesses}
              inventory={inventory}
              onlineMembers={onlineMembers}
              currentClientId={operator.clientId}
              onEditingChange={setEditingKey}
              onNotify={notify}
              onOpenPrint={setPrintPayload}
              onGoToPOS={() => setActiveView('pos')}
              onRefresh={refresh}
            />
          )}

          {activeView === 'rentals' && (
            <RentalsView
              rentals={rentals}
              businesses={businesses}
              onlineMembers={onlineMembers}
              currentClientId={operator.clientId}
              onEditingChange={setEditingKey}
              onNotify={notify}
              onOpenPrint={setPrintPayload}
              onGoToPOS={() => setActiveView('pos')}
              onRefresh={refresh}
            />
          )}

          {activeView === 'admin' && (
            <AdminView
              inventory={inventory}
              rentals={rentals}
              businesses={businesses}
              operatorName={operator.name}
              onNotify={notify}
              onOpenPrint={setPrintPayload}
              onRefresh={refresh}
            />
          )}

          {activeView === 'clients' && (
            <ClientsView
              clients={clients}
              quotes={quotes}
              rentals={rentals}
              onlineMembers={onlineMembers}
              currentClientId={operator.clientId}
              onEditingChange={setEditingKey}
              onNotify={notify}
              onOpenPrint={setPrintPayload}
              onRefresh={refresh}
            />
          )}

          {activeView === 'finance' && (
            <SlipsAndFinanceView
              payments={payments}
              businesses={businesses}
              maintenance={maintenance}
              budgets={budgets}
              inventory={inventory}
              onlineMembers={onlineMembers}
              currentClientId={operator.clientId}
              onEditingChange={setEditingKey}
              onNotify={notify}
              onOpenPrint={setPrintPayload}
              onRefresh={refresh}
            />
          )}

          {activeView === 'team' && (
            <TeamServerView
              serverInfo={serverInfo}
              serverSaves={serverSaves}
              serverUsers={serverUsers}
              onlineMembers={onlineMembers}
              activityLog={activityLog}
              currentClientId={operator.clientId}
              currentServerUserId={operator.serverUserId}
              savingToServer={savingToServer}
              onSaveToServer={handleSaveToServer}
              onSwitchUser={handleSwitchServerUser}
              onNotify={notify}
              onRefresh={refresh}
            />
          )}
        </main>
      </div>

      {/* Operator Profile Modal */}
      {showProfileModal && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-sm bg-white border border-slate-200 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">Your Team Identity</h3>
              <button
                type="button"
                onClick={() => setShowProfileModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <p className="text-slate-600">
                Your name appears in the live presence list and records who created or edited items on this server.
              </p>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Display Name *</label>
                <input
                  type="text"
                  value={opNameInput}
                  onChange={(e) => setOpNameInput(e.target.value)}
                  placeholder="e.g. Marco (Sound Tech)"
                  className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Role / Station</label>
                <input
                  type="text"
                  value={opRoleInput}
                  onChange={(e) => setOpRoleInput(e.target.value)}
                  placeholder="Warehouse Lead, Sales, Cashier..."
                  className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1.5">Badge Color</label>
                <div className="flex gap-2">
                  {OPERATOR_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setOpColorInput(color)}
                      className={`h-7 w-7 cursor-pointer transition-transform ${
                        opColorInput === color ? 'ring-2 ring-slate-900 scale-110' : 'opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              {serverUsers.filter((u) => u.status === 'ACTIVE').length > 1 && (
                <div className="pt-2 border-t border-slate-200 space-y-1.5">
                  <div className="font-medium text-slate-700">Or Switch Shared Server User</div>
                  <div className="max-h-36 overflow-y-auto space-y-1">
                    {serverUsers
                      .filter((u) => u.status === 'ACTIVE')
                      .map((u) => {
                        const isActive =
                          (operator.serverUserId !== undefined && u.id === operator.serverUserId) ||
                          u.clientId === operator.clientId;
                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => handleSwitchServerUser(u)}
                            className={`w-full flex items-center justify-between gap-2 border px-2.5 py-1.5 text-left cursor-pointer ${
                              isActive
                                ? 'border-amber-600 bg-amber-50'
                                : 'border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <span
                                className="h-5 w-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0"
                                style={{ backgroundColor: u.color }}
                              >
                                {u.name.slice(0, 2).toUpperCase()}
                              </span>
                              <span className="truncate font-medium text-slate-900">{u.name}</span>
                            </span>
                            <span className="text-[10px] font-mono text-slate-500 shrink-0">
                              {u.accessLevel}
                              {u.isOnline ? ' · LIVE' : ''}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3 bg-slate-50">
              <button
                type="button"
                onClick={() => setShowProfileModal(false)}
                className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveProfile}
                className="bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
              >
                Save Identity
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Team Edit PIN Unlock Modal */}
      {showPinModal && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-sm bg-white border border-slate-200 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <Lock className="h-4 w-4 text-amber-600" />
                Team Edit PIN Required
              </h3>
              <button
                type="button"
                onClick={() => setShowPinModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <p className="text-slate-600">
                The host server has enabled a shared Team Edit PIN. Enter the PIN to save changes from this device.
              </p>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Shared Team PIN</label>
                <input
                  type="password"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleVerifyPin();
                  }}
                  placeholder="Enter team PIN"
                  className="w-full border border-slate-300 px-2.5 py-2 font-mono focus:border-amber-600 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3 bg-slate-50">
              <button
                type="button"
                onClick={() => setShowPinModal(false)}
                className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={verifyingPin}
                onClick={handleVerifyPin}
                className="bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 cursor-pointer"
              >
                Unlock Editing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Multi-Business Official Forms Modal */}
      <PrintableFormModal
        payload={printPayload}
        businesses={businesses}
        onClose={() => setPrintPayload(null)}
      />
      <OfflineIndicator />
    </div>
  );
}
