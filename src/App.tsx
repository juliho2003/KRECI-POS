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
  detectDeviceName,
  getOperatorProfile,
  getOrCreateDeviceId,
  saveOperatorProfile,
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

  // Operator / Team Member Identity modal state
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileMode, setProfileMode] = useState<'create' | 'edit'>('create');
  const [opNameInput, setOpNameInput] = useState(operator.name);
  const [opRoleInput, setOpRoleInput] = useState(operator.role);
  const [opColorInput, setOpColorInput] = useState(operator.color);
  const [savingProfile, setSavingProfile] = useState(false);

  // Server Save PIN (2022) modal state
  const [showSavePinModal, setShowSavePinModal] = useState(false);
  const [savePinInput, setSavePinInput] = useState('');
  const [savePinError, setSavePinError] = useState('');
  const [pendingSaveLabel, setPendingSaveLabel] = useState<string | undefined>(undefined);
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
    lastRemoteEvent,
    refresh,
  } = useRealtimePOS(operator, activeView, editingKey);

  const currentServerUser = serverUsers.find(
    (u) => u.status === 'ACTIVE' && operator.serverUserId !== undefined && u.id === operator.serverUserId
  );

  const lastSyncedUserRef = useRef<string>('');
  const promptedJoinRef = useRef<boolean>(false);
  const lastRemoteToastRef = useRef<string>('');

  const notify = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    window.setTimeout(() => {
      setToast((curr) => (curr?.msg === msg ? null : curr));
    }, 4500);
  };

  useEffect(() => {
    if (!lastRemoteEvent) return;
    const key = `${lastRemoteEvent.timestamp}|${lastRemoteEvent.actor}|${lastRemoteEvent.summary}`;
    if (lastRemoteToastRef.current === key) return;
    lastRemoteToastRef.current = key;
    notify(`${lastRemoteEvent.actor} · ${lastRemoteEvent.summary}`);
  }, [lastRemoteEvent]);

  // Prompt operator once on load if they haven't added or selected a team member account yet
  useEffect(() => {
    if (loading) return;
    const deviceId = operator.deviceId || getOrCreateDeviceId();
    const deviceName = operator.deviceName || detectDeviceName();
    if (operator.serverUserId && !currentServerUser) {
      const cleared: OperatorProfile = {
        clientId: deviceId,
        deviceId,
        deviceName,
        name: '',
        role: 'Team Member',
        color: operator.color || OPERATOR_COLORS[0],
      };
      saveOperatorProfile(cleared);
      setOperator(cleared);
    }
    if (!currentServerUser && !promptedJoinRef.current) {
      promptedJoinRef.current = true;
      setProfileMode('create');
      setOpNameInput('');
      setOpRoleInput('Team Member');
      setShowProfileModal(true);
    }
  }, [loading, currentServerUser, operator.serverUserId, operator.deviceId, operator.deviceName, operator.color]);

  // Resolve personal shared server invite links (?invite=TOKEN)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inviteToken = params.get('invite');
    if (!inviteToken) return;

    const cleanUrl = window.location.pathname + (window.location.hash || '');
    window.history.replaceState({}, '', cleanUrl);

    const deviceId = getOrCreateDeviceId();
    const deviceName = detectDeviceName();

    fetch(`/api/server-users/resolve?invite=${encodeURIComponent(inviteToken)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Invalid invite link');
        return data as ServerUser;
      })
      .then(async (user) => {
        const nextOp: OperatorProfile = {
          clientId: user.clientId,
          deviceId,
          deviceName,
          serverUserId: user.id,
          inviteToken: user.inviteToken,
          name: user.name,
          role: user.role,
          color: user.color,
        };
        lastSyncedUserRef.current = `${user.id}|${user.name}|${user.role}|${user.color}|${user.inviteToken}`;
        saveOperatorProfile(nextOp);
        setOperator(nextOp);
        await fetch('/api/presence', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Device-Id': deviceId,
            'X-Device-Name': deviceName,
          },
          body: JSON.stringify({
            clientId: user.clientId,
            deviceId,
            deviceName,
            serverUserId: user.id,
            name: user.name,
            role: user.role,
            color: user.color,
            activeView,
          }),
        }).catch(() => {});
        notify(`Signed in via shared server link as ${user.name} (${user.accessLevel}).`);
        refresh();
      })
      .catch((err) => {
        notify((err as Error).message, 'error');
      });
  }, [refresh, activeView]);

  // Keep local operator linked with live DB ServerUser updates
  useEffect(() => {
    if (!currentServerUser) return;
    const deviceId = operator.deviceId || getOrCreateDeviceId();
    const deviceName = operator.deviceName || detectDeviceName();
    const snapshot = `${currentServerUser.id}|${currentServerUser.name}|${currentServerUser.role}|${currentServerUser.color}|${currentServerUser.inviteToken}`;
    if (lastSyncedUserRef.current === snapshot) return;
    lastSyncedUserRef.current = snapshot;

    const nextOp: OperatorProfile = {
      clientId: currentServerUser.clientId,
      deviceId,
      deviceName,
      serverUserId: currentServerUser.id,
      inviteToken: currentServerUser.inviteToken,
      name: currentServerUser.name,
      role: currentServerUser.role,
      color: currentServerUser.color,
    };
    saveOperatorProfile(nextOp);
    setOperator(nextOp);
  }, [currentServerUser, operator.deviceId, operator.deviceName]);

  const handleSwitchServerUser = async (u: ServerUser) => {
    const deviceId = operator.deviceId || getOrCreateDeviceId();
    const deviceName = operator.deviceName || detectDeviceName();
    if (currentServerUser && currentServerUser.id !== u.id) {
      await fetch('/api/presence/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Device-Id': deviceId },
        body: JSON.stringify({ serverUserId: currentServerUser.id, deviceId }),
      }).catch(() => {});
    }

    const nextOp: OperatorProfile = {
      clientId: u.clientId,
      deviceId,
      deviceName,
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

    await fetch('/api/presence', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': deviceId,
        'X-Device-Name': deviceName,
      },
      body: JSON.stringify({
        clientId: u.clientId,
        deviceId,
        deviceName,
        serverUserId: u.id,
        name: u.name,
        role: u.role,
        color: u.color,
        activeView,
        editingKey,
      }),
    }).catch(() => {});

    notify(`Active on ${deviceName} as ${u.name} (${u.accessLevel}).`);
    refresh();
  };

  const handleLeaveAccount = async () => {
    const deviceId = operator.deviceId || getOrCreateDeviceId();
    const deviceName = operator.deviceName || detectDeviceName();
    if (currentServerUser) {
      await fetch('/api/presence/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Device-Id': deviceId },
        body: JSON.stringify({ serverUserId: currentServerUser.id, deviceId }),
      }).catch(() => {});
    }
    const cleared: OperatorProfile = {
      clientId: deviceId,
      deviceId,
      deviceName,
      name: '',
      role: 'Team Member',
      color: operator.color || OPERATOR_COLORS[0],
    };
    lastSyncedUserRef.current = '';
    saveOperatorProfile(cleared);
    setOperator(cleared);
    setProfileMode('create');
    setOpNameInput('');
    setOpRoleInput('Team Member');
    notify('Signed out of operator account on this device.');
    refresh();
  };

  const openOperatorModal = (mode?: 'create' | 'edit') => {
    const resolvedMode = mode ?? (currentServerUser ? 'edit' : 'create');
    setProfileMode(resolvedMode);
    if (resolvedMode === 'create') {
      setOpNameInput('');
      setOpRoleInput('Team Member');
      setOpColorInput(OPERATOR_COLORS[serverUsers.length % OPERATOR_COLORS.length]);
    } else {
      setOpNameInput(operator.name);
      setOpRoleInput(operator.role || 'Team Member');
      setOpColorInput(operator.color || OPERATOR_COLORS[0]);
    }
    setShowProfileModal(true);
  };

  const handleSaveProfile = async () => {
    const cleanName = opNameInput.trim();
    const cleanRole = opRoleInput.trim() || 'Team Member';
    const deviceId = operator.deviceId || getOrCreateDeviceId();
    const deviceName = operator.deviceName || detectDeviceName();
    if (!cleanName) {
      notify('Enter your operator name first.', 'error');
      return;
    }

    setSavingProfile(true);
    try {
      if (profileMode === 'edit' && currentServerUser && currentServerUser.status === 'ACTIVE') {
        const res = await apiFetch(`/api/server-users/${currentServerUser.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: cleanName,
            role: cleanRole,
            color: opColorInput,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update team member account');
        const updated: OperatorProfile = {
          clientId: data.clientId,
          deviceId,
          deviceName,
          serverUserId: data.id,
          inviteToken: data.inviteToken,
          name: data.name,
          role: data.role,
          color: data.color,
        };
        lastSyncedUserRef.current = `${data.id}|${data.name}|${data.role}|${data.color}|${data.inviteToken}`;
        saveOperatorProfile(updated);
        setOperator(updated);
        setShowProfileModal(false);
        notify(`Updated team member account: ${data.name} (${data.role}).`);
        refresh();
        return;
      }

      // Add a new team member account (or bind existing exact name) on this device + IP
      const res = await apiFetch('/api/server-users', {
        method: 'POST',
        body: JSON.stringify({
          name: cleanName,
          role: cleanRole,
          accessLevel: 'EDITOR',
          canEdit: true,
          color: opColorInput,
          addedBy: cleanName,
          bindDevice: true,
          deviceId,
          deviceName,
          activeView,
        }),
      });
      const created = (await res.json()) as ServerUser & { error?: string };
      if (!res.ok) throw new Error(created.error || 'Failed to add team member account');

      const nextOp: OperatorProfile = {
        clientId: created.clientId,
        deviceId,
        deviceName,
        serverUserId: created.id,
        inviteToken: created.inviteToken,
        name: created.name,
        role: created.role,
        color: created.color,
      };
      lastSyncedUserRef.current = `${created.id}|${created.name}|${created.role}|${created.color}|${created.inviteToken}`;
      saveOperatorProfile(nextOp);
      setOperator(nextOp);
      setShowProfileModal(false);
      notify(`Online on ${deviceName} as ${created.name}.`);
      refresh();
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveToServer = async (label?: string) => {
    setPendingSaveLabel(label);
    setSavePinInput('');
    setSavePinError('');
    setShowSavePinModal(true);
  };

  const handleConfirmSaveToServer = async () => {
    const cleanPin = savePinInput.trim();
    if (!cleanPin) {
      setSavePinError('Enter the Server Save PIN to continue.');
      return;
    }
    setSavingToServer(true);
    setSavePinError('');
    try {
      const res = await apiFetch('/api/server/save', {
        method: 'POST',
        body: JSON.stringify({ label: pendingSaveLabel, pin: cleanPin }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error || 'Incorrect Server Save PIN';
        setSavePinError(msg);
        throw new Error(msg);
      }
      setShowSavePinModal(false);
      setSavePinInput('');
      setPendingSaveLabel(undefined);
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
            onClick={() => openOperatorModal()}
            className="w-full flex items-center gap-2.5 p-2 bg-slate-800/80 hover:bg-slate-800 text-left transition-colors cursor-pointer"
          >
            <span
              className="h-6 w-6 shrink-0 flex items-center justify-center text-[11px] font-bold text-white"
              style={{ backgroundColor: currentServerUser ? operator.color : '#475569' }}
            >
              {currentServerUser && operator.name ? operator.name.slice(0, 2).toUpperCase() : '+'}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-white truncate">
                {currentServerUser && operator.name ? operator.name : 'Add Operator Name'}
              </div>
              <div className="text-[10px] text-slate-400 truncate">
                {currentServerUser ? `${operator.role} · Switch / Edit` : 'Join as team member'}
              </div>
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
              onClick={() => openOperatorModal()}
              className={`inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-xs font-medium cursor-pointer ${
                currentServerUser
                  ? 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                  : 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
              }`}
              title={currentServerUser ? 'Switch or update team member account' : 'Add your name to join the team'}
            >
              <UserCheck className="h-3.5 w-3.5 text-amber-600" />
              <span className="hidden md:inline">
                {currentServerUser && operator.name ? operator.name : 'Add / Join Team'}
              </span>
            </button>

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

        {/* Live Access Restriction Banner (Revoked Only) */}
        {currentServerUser && currentServerUser.status === 'REVOKED' && (
          <div className="no-print border-b px-4 sm:px-6 py-2 text-xs flex items-center justify-between gap-3 bg-red-50 border-red-200 text-red-900">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                Access Revoked for {currentServerUser.name} — You can view cached data, but server edits are disabled by the owner.
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

        {/* Live Multi-Device Editing & Auto-Save Strip */}
        <div className="no-print border-b border-slate-200 bg-slate-50 px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700 shrink-0">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Single Server Live:
            </span>
            {onlineMembers.length === 0 ? (
              <span className="text-slate-500">Waiting for active team operator...</span>
            ) : (
              onlineMembers.map((m) => (
                <span
                  key={`${m.serverUserId ?? m.clientId}-${m.deviceId ?? ''}`}
                  className={`inline-flex items-center gap-1.5 border px-2 py-0.5 ${
                    m.editingKey
                      ? 'border-amber-300 bg-amber-50 text-amber-900'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: m.color }}
                  />
                  <span className="font-semibold">{m.name}</span>
                  {m.deviceName && (
                    <span className="hidden md:inline text-slate-400">({m.deviceName})</span>
                  )}
                  <span className="font-mono text-[10px] uppercase text-slate-500">
                    {m.editingKey ? `Editing ${m.editingKey}` : m.activeView}
                  </span>
                </span>
              ))
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {activityLog[0] && (
              <span className="hidden lg:inline text-slate-600 truncate max-w-md" title={activityLog[0].summary}>
                Latest edit: <strong className="text-slate-800">{activityLog[0].actorName}</strong> · {activityLog[0].summary}
              </span>
            )}
            <span className="inline-flex items-center gap-1 border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800">
              <Check className="h-3 w-3" />
              Auto-Save Active
            </span>
          </div>
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
              onEditingChange={setEditingKey}
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
              currentDeviceId={operator.deviceId}
              currentDeviceName={operator.deviceName}
              currentServerUserId={currentServerUser?.id}
              savingToServer={savingToServer}
              onSaveToServer={handleSaveToServer}
              onSwitchUser={handleSwitchServerUser}
              onOpenAddMemberModal={() => openOperatorModal('create')}
              onNotify={notify}
              onRefresh={refresh}
            />
          )}
        </main>
      </div>

      {/* Operator Team Account Modal */}
      {showProfileModal && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">
                {profileMode === 'edit' && currentServerUser
                  ? 'Update Team Member Account'
                  : 'Add Your Name & Join Team'}
              </h3>
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
                {profileMode === 'edit' && currentServerUser
                  ? 'Update your active team member details, add a new operator account, or switch to an existing member.'
                  : 'Enter your name to create your team member account on this server and use it on this device, or pick an existing team member below.'}
              </p>

              {currentServerUser && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => openOperatorModal('edit')}
                    className={`flex-1 border px-2.5 py-1.5 text-[11px] font-semibold cursor-pointer ${
                      profileMode === 'edit'
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Edit Current ({currentServerUser.name})
                  </button>
                  <button
                    type="button"
                    onClick={() => openOperatorModal('create')}
                    className={`flex-1 border px-2.5 py-1.5 text-[11px] font-semibold cursor-pointer ${
                      profileMode === 'create'
                        ? 'border-amber-600 bg-amber-600 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    + Add New Member
                  </button>
                </div>
              )}

              <div>
                <label className="block font-medium text-slate-700 mb-1">Operator Name *</label>
                <input
                  type="text"
                  value={opNameInput}
                  onChange={(e) => setOpNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveProfile();
                  }}
                  placeholder="e.g. Marco Reyes"
                  className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Role / Station</label>
                <input
                  type="text"
                  value={opRoleInput}
                  onChange={(e) => setOpRoleInput(e.target.value)}
                  placeholder="Audio Lead, Cashier, Tech..."
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

              {serverUsers.filter((u) => u.status === 'ACTIVE').length > 0 && (
                <div className="pt-2 border-t border-slate-200 space-y-1.5">
                  <div className="font-medium text-slate-700">Or Use an Existing Team Member Account</div>
                  <div className="max-h-36 overflow-y-auto space-y-1">
                    {serverUsers
                      .filter((u) => u.status === 'ACTIVE')
                      .map((u) => {
                        const isActive = currentServerUser?.id === u.id;
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
                              <span className="text-[10px] text-slate-500 truncate">{u.role}</span>
                            </span>
                            <span className="text-[10px] font-mono text-slate-600 shrink-0">
                              {isActive ? 'ACTIVE' : 'Use Account'}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 bg-slate-50">
              <div>
                {currentServerUser && (
                  <button
                    type="button"
                    onClick={handleLeaveAccount}
                    className="border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 cursor-pointer"
                  >
                    Sign Out
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowProfileModal(false)}
                  className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingProfile}
                  onClick={handleSaveProfile}
                  className="bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer disabled:opacity-60"
                >
                  {savingProfile
                    ? 'Saving...'
                    : profileMode === 'edit' && currentServerUser
                      ? 'Update Team Account'
                      : 'Add & Use Account'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Save to Main Server PIN Modal */}
      {showSavePinModal && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-sm bg-white border border-slate-200 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <Lock className="h-4 w-4 text-emerald-700" />
                Save Checkpoint to Server
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowSavePinModal(false);
                  setSavePinError('');
                }}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <p className="text-slate-600">
                Enter the Server Save PIN to save this checkpoint to the main server.
              </p>
              {pendingSaveLabel && (
                <div className="bg-slate-50 border border-slate-200 px-2.5 py-1.5 text-[11px] text-slate-700">
                  Checkpoint Note: <strong className="text-slate-900">{pendingSaveLabel}</strong>
                </div>
              )}
              <div>
                <label className="block font-medium text-slate-700 mb-1">Server Save PIN *</label>
                <input
                  type="password"
                  inputMode="numeric"
                  autoFocus
                  value={savePinInput}
                  onChange={(e) => {
                    setSavePinInput(e.target.value);
                    if (savePinError) setSavePinError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmSaveToServer();
                  }}
                  placeholder="Enter Server Save PIN"
                  className="w-full border border-slate-300 px-2.5 py-2 font-mono focus:border-emerald-700 focus:outline-none"
                />
                {savePinError && (
                  <div className="mt-1.5 text-[11px] font-semibold text-red-600">{savePinError}</div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3 bg-slate-50">
              <button
                type="button"
                onClick={() => {
                  setShowSavePinModal(false);
                  setSavePinError('');
                }}
                className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingToServer}
                onClick={handleConfirmSaveToServer}
                className="bg-emerald-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 cursor-pointer disabled:opacity-60"
              >
                {savingToServer ? 'Saving...' : 'Verify PIN & Save'}
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
