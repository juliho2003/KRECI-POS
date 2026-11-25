import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  Copy,
  Database,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  KeyRound,
  Link2,
  Lock,
  Monitor,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  Share2,
  ShieldCheck,
  Smartphone,
  Terminal,
  Trash2,
  Unlock,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type {
  ActivityLogEntry,
  PresenceMember,
  ServerInfo,
  ServerSavepoint,
  ServerUser,
  ServerUserAccess,
} from '../types';
import { apiFetch, copyTextSafe, shareLinkNative } from '../utils/api';

interface TeamServerViewProps {
  serverInfo: ServerInfo | null;
  serverSaves: ServerSavepoint[];
  serverUsers: ServerUser[];
  onlineMembers: PresenceMember[];
  activityLog: ActivityLogEntry[];
  currentClientId: string;
  currentServerUserId?: number;
  savingToServer: boolean;
  onSaveToServer: (label?: string) => Promise<void>;
  onSwitchUser: (user: ServerUser) => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
  onRefresh: () => void;
}

const USER_COLORS = ['#d97706', '#0284c7', '#059669', '#7c3aed', '#dc2626', '#db2777', '#0d9488'];

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatUptime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function TeamServerView({
  serverInfo,
  serverSaves,
  serverUsers,
  onlineMembers,
  activityLog,
  currentClientId,
  currentServerUserId,
  savingToServer,
  onSaveToServer,
  onSwitchUser,
  onNotify,
  onRefresh,
}: TeamServerViewProps) {
  const browserOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const allUrls = Array.from(
    new Set(
      [
        ...(serverInfo?.lanUrls ?? []),
        ...(serverInfo?.publicAppUrl ? [serverInfo.publicAppUrl] : []),
        ...(browserOrigin ? [browserOrigin] : []),
      ].filter(Boolean)
    )
  );

  const [selectedUrl, setSelectedUrl] = useState<string>(allUrls[0] || browserOrigin);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedUrl, setCopiedUrl] = useState<string>('');
  const [saveLabel, setSaveLabel] = useState('');

  const [serverLabel, setServerLabel] = useState(serverInfo?.serverLabel ?? 'KR-ONCUE Main Team Server');
  const [pinEnabled, setPinEnabled] = useState(serverInfo?.teamPinEnabled ?? false);
  const [pinValue, setPinValue] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Live Server Users & Shared Access state
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState('Team Member');
  const [newUserAccess, setNewUserAccess] = useState<ServerUserAccess>('EDITOR');
  const [newUserColor, setNewUserColor] = useState(USER_COLORS[1]);
  const [creatingUser, setCreatingUser] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<number | null>(null);
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<number | null>(null);
  const [selectedApiUserId, setSelectedApiUserId] = useState<number | ''>('');
  const [showApiToken, setShowApiToken] = useState(false);

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useEffect(() => {
    if (serverInfo) {
      setServerLabel(serverInfo.serverLabel);
      setPinEnabled(serverInfo.teamPinEnabled);
    }
  }, [serverInfo]);

  useEffect(() => {
    if (!selectedUrl && allUrls.length > 0) {
      setSelectedUrl(allUrls[0]);
    }
  }, [allUrls, selectedUrl]);

  useEffect(() => {
    const target = selectedUrl || browserOrigin;
    if (!target) return;
    QRCode.toDataURL(target, { width: 220, margin: 1, color: { dark: '#0f172a', light: '#ffffff' } })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(''));
  }, [selectedUrl, browserOrigin]);

  const copyToClipboard = async (text: string, label?: string) => {
    const ok = await copyTextSafe(text);
    if (ok) {
      setCopiedUrl(text);
      onNotify(label ? `Copied ${label}.` : `Copied ${text} to clipboard.`);
      window.setTimeout(() => setCopiedUrl((curr) => (curr === text ? '' : curr)), 2200);
    } else {
      onNotify('Unable to copy automatically — select and copy manually.', 'error');
    }
  };

  const handleNativeShare = async (title: string, text: string, url: string) => {
    const result = await shareLinkNative(title, text, url);
    if (result === 'copied') {
      setCopiedUrl(url);
      onNotify('Link copied — paste into Messages, AirDrop, or WhatsApp.');
      window.setTimeout(() => setCopiedUrl((curr) => (curr === url ? '' : curr)), 2200);
    } else if (result === 'shared') {
      onNotify('Shared via device Share Sheet.');
    }
  };

  const handleSaveSettings = async () => {
    if (pinEnabled && !serverInfo?.teamPinEnabled && !pinValue.trim()) {
      onNotify('Enter a Team PIN before enabling PIN protection.', 'error');
      return;
    }
    setSavingSettings(true);
    try {
      const body: Record<string, unknown> = {
        serverLabel: serverLabel.trim() || 'KR-ONCUE Main Team Server',
        teamPinEnabled: pinEnabled,
      };
      if (pinValue.trim()) {
        body.teamPin = pinValue.trim();
      }
      const res = await apiFetch('/api/server-settings', {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save server settings');
      setPinValue('');
      onNotify('Team server sharing settings saved.');
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleRestoreFile = async (file: File) => {
    setRestoring(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await apiFetch('/api/backup/restore', {
        method: 'POST',
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Restore failed');
      onNotify('Team database restored and synced to all connected devices.');
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    } finally {
      setRestoring(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRestoreSavepoint = async (sp: ServerSavepoint) => {
    setRestoring(true);
    try {
      const res = await apiFetch(`/api/server/saves/${sp.id}/restore`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to restore savepoint');
      onNotify(`Restored "${sp.label}" to main server and synced to all connected users.`);
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    } finally {
      setRestoring(false);
    }
  };

  const handleDeleteSavepoint = async (sp: ServerSavepoint) => {
    try {
      const res = await apiFetch(`/api/server/saves/${sp.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete savepoint');
      onNotify(`Removed savepoint "${sp.label}".`);
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    }
  };

  const handleCreateUser = async () => {
    if (!newUserName.trim()) {
      onNotify('Enter the user name to share access with.', 'error');
      return;
    }
    setCreatingUser(true);
    try {
      const res = await apiFetch('/api/server-users', {
        method: 'POST',
        body: JSON.stringify({
          name: newUserName.trim(),
          email: newUserEmail.trim(),
          role: newUserRole.trim() || 'Team Member',
          accessLevel: newUserAccess,
          canEdit: newUserAccess !== 'VIEWER',
          color: newUserColor,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add server user');
      const base = selectedUrl || browserOrigin;
      const inviteLink = `${base}/?invite=${data.inviteToken}`;
      onNotify(`Added ${data.name} (${data.accessLevel}) — share link is ready.`);
      const copied = await copyTextSafe(inviteLink);
      if (copied) {
        setCopiedUrl(inviteLink);
        window.setTimeout(() => setCopiedUrl((curr) => (curr === inviteLink ? '' : curr)), 2500);
      }
      setNewUserName('');
      setNewUserEmail('');
      setNewUserRole('Team Member');
      setNewUserAccess('EDITOR');
      setShowAddUser(false);
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    } finally {
      setCreatingUser(false);
    }
  };

  const handleUpdateUser = async (
    u: ServerUser,
    patch: Partial<{ accessLevel: ServerUserAccess; canEdit: boolean; status: 'ACTIVE' | 'REVOKED' }>
  ) => {
    setUpdatingUserId(u.id);
    try {
      const res = await apiFetch(`/api/server-users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update server user');
      onNotify(`Updated access for ${data.name} (${data.accessLevel} · ${data.status}).`);
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleDeleteUser = async (u: ServerUser) => {
    setUpdatingUserId(u.id);
    try {
      const res = await apiFetch(`/api/server-users/${u.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove server user');
      setConfirmDeleteUserId(null);
      onNotify(`Removed ${u.name} from shared server users.`);
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    } finally {
      setUpdatingUserId(null);
    }
  };

  const onlineUserCount = serverUsers.filter((u) => u.isOnline).length;

  return (
    <div className="space-y-5">
      {/* Top Row: Server Share Links + QR & Active Team Devices */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Share This Device Server */}
        <div className="lg:col-span-7 bg-white border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-amber-600" />
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Team Server & Sharing Hub
                </h2>
                <p className="text-xs text-slate-500">
                  Share any address below so teammates on phones, tablets, or laptops can edit together in real time.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-1 border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>

          <div className="p-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            <div className="md:col-span-8 space-y-3">
              <div>
                <div className="text-xs font-semibold text-slate-700 mb-1.5">
                  Available Server Addresses
                </div>
                <div className="space-y-2">
                  {allUrls.map((url) => {
                    const isLan = /^http:\/\/(192\.168\.|10\.|172\.)/.test(url);
                    const isBonjour = /\.local:\d+/i.test(url);
                    const isSelected = selectedUrl === url;
                    return (
                      <div
                        key={url}
                        onClick={() => setSelectedUrl(url)}
                        className={`flex items-center justify-between gap-2 border p-2.5 text-xs cursor-pointer transition-colors ${
                          isSelected ? 'border-amber-600 bg-amber-50/40' : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-mono font-semibold text-slate-900 truncate">{url}</div>
                          <div className="text-[11px] text-slate-500">
                            {isBonjour
                              ? 'Apple Bonjour / Local Mac & iPhone URL (.local)'
                              : isLan
                                ? 'Local Wi-Fi / LAN Device Server (same network)'
                                : 'Current Browser / Shared App URL'}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {canNativeShare && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleNativeShare('KR-ONCUE Team Server', 'Open KR-ONCUE POS Server', url);
                              }}
                              className="inline-flex items-center gap-1 border border-slate-300 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                              title="Share via AirDrop / Messages"
                            >
                              <Share2 className="h-3 w-3" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(url);
                            }}
                            className="inline-flex items-center gap-1 border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                          >
                            {copiedUrl === url ? (
                              <>
                                <Check className="h-3 w-3 text-emerald-600" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                Copy
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {serverInfo?.runtime === 'netlify' ? (
                <div className="bg-emerald-50 border border-emerald-200 p-3 text-xs space-y-1.5">
                  <div className="font-semibold text-emerald-950">Netlify Cloud Serverless Hosting Active:</div>
                  <ol className="list-decimal list-inside space-y-1 text-emerald-900">
                    <li>
                      Your POS database is persisted via <strong>Netlify Blobs</strong> and served over HTTPS from <code className="bg-white border border-emerald-200 px-1 py-0.5 font-mono text-[11px]">{browserOrigin}</code>.
                    </li>
                    <li>
                      Share the URL or QR code with any teammate anywhere — edits sync automatically across devices every few seconds.
                    </li>
                    <li>
                      Use <strong>Install App</strong> (or Safari &ldquo;Add to Home Screen&rdquo;) to install this POS directly onto phones, tablets, or desktops.
                    </li>
                  </ol>
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200 p-3 text-xs space-y-1.5">
                  <div className="font-semibold text-slate-800">How to Host This Device as a Local Team Server:</div>
                  <ol className="list-decimal list-inside space-y-1 text-slate-600">
                    <li>
                      Connect this host computer and your team devices to the same Wi-Fi or router.
                    </li>
                    <li>
                      Run <code className="bg-white border border-slate-200 px-1 py-0.5 font-mono text-[11px]">npm run dev</code> (or <code className="bg-white border border-slate-200 px-1 py-0.5 font-mono text-[11px]">npm run build && npx tsx server.ts</code>) on this device. It listens on <code className="font-mono text-[11px]">0.0.0.0:3000</code>.
                    </li>
                    <li>
                      Have teammates open the LAN IP URL (or scan the QR code) in their browser — every edit saves directly to this device&apos;s SQLite database and syncs live.
                    </li>
                  </ol>
                </div>
              )}
            </div>

            <div className="md:col-span-4 flex flex-col items-center justify-center border border-slate-200 bg-slate-50 p-3 text-center">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="Team Server QR Code" className="w-40 h-40 bg-white p-1 border border-slate-200" />
              ) : (
                <div className="w-40 h-40 bg-slate-100 flex items-center justify-center text-xs text-slate-400">
                  Generating QR...
                </div>
              )}
              <div className="mt-2 text-[11px] font-medium text-slate-700">Scan on Phone / Tablet</div>
              <div className="mt-0.5 font-mono text-[10px] text-slate-500 max-w-full truncate">
                {selectedUrl}
              </div>
            </div>
          </div>
        </div>

        {/* Connected Team Devices (Live Presence) */}
        <div className="lg:col-span-5 bg-white border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-600" />
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Connected Team ({onlineMembers.length})
                </h2>
                <p className="text-xs text-slate-500">Live devices currently synced to this server</p>
              </div>
            </div>
          </div>

          <div className="divide-y divide-slate-100 max-h-[340px] overflow-y-auto">
            {onlineMembers.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                Connecting to presence channel...
              </div>
            ) : (
              onlineMembers.map((m) => {
                const isSelf = m.clientId === currentClientId;
                return (
                  <div key={m.clientId} className="px-4 py-3 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="h-7 w-7 rounded-full text-white font-bold flex items-center justify-center shrink-0 text-[11px]"
                        style={{ backgroundColor: m.color }}
                      >
                        {m.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate">
                          {m.name} {isSelf && <span className="text-amber-600 font-normal">(You)</span>}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                          <span>{m.role}</span>
                          <span>·</span>
                          <span className="uppercase font-mono text-slate-700">{m.activeView}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      {m.editingKey ? (
                        <span className="inline-block bg-amber-50 border border-amber-200 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-800">
                          Editing {m.editingKey}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-medium">
                          <Monitor className="h-3 w-3" />
                          Active
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Live Server Users & Shared Web Access */}
      <div className="bg-white border border-slate-200">
        <div className="border-b border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Users className="h-4 w-4 text-amber-600" />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-slate-900">
                  Live Server Users &amp; Shared Access
                </h3>
                <span className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {onlineUserCount} online live
                </span>
                <span className="font-mono text-[11px] text-slate-500">
                  {serverUsers.length} shared {serverUsers.length === 1 ? 'user' : 'users'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Everyone who owns, was invited to, or opened this web server — manage live permissions and personal invite links.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowAddUser((prev) => !prev)}
            className="inline-flex items-center gap-1.5 bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 cursor-pointer"
          >
            {showAddUser ? <X className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
            {showAddUser ? 'Close Form' : 'Share / Add User'}
          </button>
        </div>

        {showAddUser && (
          <div className="border-b border-slate-200 bg-amber-50/40 p-4 space-y-3 text-xs">
            <div className="font-semibold text-slate-900">
              Grant Access &amp; Generate Personal Web Invite Link
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="e.g. Marco Reyes"
                  className="w-full border border-slate-300 bg-white px-2.5 py-1.5 focus:border-amber-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Email / Contact Handle</label>
                <input
                  type="text"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="marco@kr-oncue.ph (optional)"
                  className="w-full border border-slate-300 bg-white px-2.5 py-1.5 focus:border-amber-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Role / Station</label>
                <input
                  type="text"
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value)}
                  placeholder="Audio Lead, Cashier, Tech..."
                  className="w-full border border-slate-300 bg-white px-2.5 py-1.5 focus:border-amber-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Access Permission</label>
                <select
                  value={newUserAccess}
                  onChange={(e) => setNewUserAccess(e.target.value as ServerUserAccess)}
                  className="w-full border border-slate-300 bg-white px-2.5 py-1.5 focus:border-amber-600 focus:outline-none"
                >
                  <option value="EDITOR">EDITOR (Can Edit &amp; Save)</option>
                  <option value="VIEWER">VIEWER (View Only)</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Badge Color</label>
                <div className="flex items-center gap-1.5 pt-1">
                  {USER_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewUserColor(color)}
                      className={`h-6 w-6 cursor-pointer ${
                        newUserColor === color ? 'ring-2 ring-slate-900 scale-110' : 'opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddUser(false)}
                className="border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={creatingUser}
                onClick={handleCreateUser}
                className="inline-flex items-center gap-1.5 bg-slate-900 px-4 py-1.5 font-semibold text-white hover:bg-slate-800 cursor-pointer disabled:opacity-60"
              >
                <UserPlus className="h-3.5 w-3.5" />
                {creatingUser ? 'Adding User...' : 'Create & Copy Invite Link'}
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                <th className="px-4 py-2.5">Server User</th>
                <th className="px-4 py-2.5">Station / Role</th>
                <th className="px-4 py-2.5">Live Status</th>
                <th className="px-4 py-2.5">Permission</th>
                <th className="px-4 py-2.5">Shared By</th>
                <th className="px-4 py-2.5 text-right">Share Link &amp; Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {serverUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    Loading live server users...
                  </td>
                </tr>
              ) : (
                serverUsers.map((u) => {
                  const isSelf =
                    (currentServerUserId !== undefined && u.id === currentServerUserId) ||
                    u.clientId === currentClientId;
                  const base = selectedUrl || browserOrigin;
                  const inviteLink = `${base}/?invite=${u.inviteToken}`;
                  const isOwner = u.accessLevel === 'OWNER';
                  const isUpdating = updatingUserId === u.id;

                  return (
                    <tr
                      key={u.id}
                      className={
                        u.status === 'REVOKED'
                          ? 'bg-red-50/30 opacity-80'
                          : isSelf
                            ? 'bg-amber-50/30'
                            : 'hover:bg-slate-50'
                      }
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="relative shrink-0">
                            <span
                              className="h-7 w-7 rounded-full text-white font-bold flex items-center justify-center text-[11px]"
                              style={{ backgroundColor: u.color }}
                            >
                              {u.name.slice(0, 2).toUpperCase()}
                            </span>
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${
                                u.isOnline ? 'bg-emerald-500' : 'bg-slate-300'
                              }`}
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 flex items-center gap-1.5 flex-wrap">
                              <span>{u.name}</span>
                              {isSelf && (
                                <span className="bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.5 text-[10px] font-semibold">
                                  You
                                </span>
                              )}
                              {u.status === 'REVOKED' && (
                                <span className="bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 text-[10px] font-semibold">
                                  REVOKED
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {u.email || u.clientId}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-2.5 text-slate-700">{u.role}</td>

                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {u.isOnline ? (
                          <div className="space-y-0.5">
                            <div className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              ONLINE LIVE
                              {u.activeView && (
                                <span className="font-mono text-[10px] uppercase bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-slate-700">
                                  {u.activeView}
                                </span>
                              )}
                            </div>
                            {u.editingKey && (
                              <div className="font-mono text-[10px] text-amber-800">
                                Editing {u.editingKey}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-slate-500">
                            <div>Offline</div>
                            <div className="font-mono text-[10px] text-slate-400">
                              Last seen {new Date(u.lastSeenAt).toLocaleString()}
                            </div>
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {isOwner ? (
                          <span className="inline-flex items-center gap-1 bg-slate-900 text-white px-2 py-0.5 text-[10px] font-semibold">
                            OWNER · FULL ACCESS
                          </span>
                        ) : (
                          <select
                            disabled={isUpdating}
                            value={u.accessLevel}
                            onChange={(e) => {
                              const nextLevel = e.target.value as ServerUserAccess;
                              handleUpdateUser(u, {
                                accessLevel: nextLevel,
                                canEdit: nextLevel === 'EDITOR',
                              });
                            }}
                            className={`border px-2 py-1 text-[11px] font-semibold focus:outline-none cursor-pointer ${
                              u.accessLevel === 'EDITOR'
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                : 'border-amber-300 bg-amber-50 text-amber-800'
                            }`}
                          >
                            <option value="EDITOR">EDITOR (Can Edit)</option>
                            <option value="VIEWER">VIEWER (View Only)</option>
                          </select>
                        )}
                      </td>

                      <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                        <div>{u.addedBy}</div>
                        <div className="font-mono text-[10px] text-slate-400">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </div>
                      </td>

                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => copyToClipboard(inviteLink, `invite link for ${u.name}`)}
                            className="inline-flex items-center gap-1 border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                            title={`Copy invite link: ${inviteLink}`}
                          >
                            {copiedUrl === inviteLink ? (
                              <>
                                <Check className="h-3 w-3 text-emerald-600" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Link2 className="h-3 w-3" />
                                Invite Link
                              </>
                            )}
                          </button>

                          {canNativeShare && (
                            <button
                              type="button"
                              onClick={() =>
                                handleNativeShare(
                                  `KR-ONCUE Access for ${u.name}`,
                                  `Join KR-ONCUE Team Server as ${u.name} (${u.accessLevel})`,
                                  inviteLink
                                )
                              }
                              className="inline-flex items-center gap-1 border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                              title="Send via AirDrop, Messages, or Mail"
                            >
                              <Share2 className="h-3 w-3" />
                            </button>
                          )}

                          {!isSelf && u.status === 'ACTIVE' && (
                            <button
                              type="button"
                              onClick={() => onSwitchUser(u)}
                              className="inline-flex items-center gap-1 border border-sky-300 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-800 hover:bg-sky-100 cursor-pointer"
                              title="Switch this browser into this user's shared profile"
                            >
                              <UserCheck className="h-3 w-3" />
                              Use Profile
                            </button>
                          )}

                          {!isOwner && (
                            <>
                              <button
                                type="button"
                                disabled={isUpdating}
                                onClick={() =>
                                  handleUpdateUser(u, {
                                    status: u.status === 'ACTIVE' ? 'REVOKED' : 'ACTIVE',
                                  })
                                }
                                className={`border px-2 py-1 text-[11px] font-semibold cursor-pointer ${
                                  u.status === 'ACTIVE'
                                    ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                                    : 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                                }`}
                              >
                                {u.status === 'ACTIVE' ? 'Revoke' : 'Restore'}
                              </button>

                              {confirmDeleteUserId === u.id ? (
                                <button
                                  type="button"
                                  disabled={isUpdating}
                                  onClick={() => handleDeleteUser(u)}
                                  className="bg-red-600 text-white px-2 py-1 text-[11px] font-semibold hover:bg-red-700 cursor-pointer"
                                >
                                  Confirm
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isUpdating}
                                  onClick={() => setConfirmDeleteUserId(u.id)}
                                  className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                                  title="Remove server user"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Second Row: Server Security Settings & Database Backup / Persistence */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Server Label & Team Edit PIN */}
        <div className="lg:col-span-5 bg-white border border-slate-200 p-4 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2.5">
            <ShieldCheck className="h-4 w-4 text-slate-700" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Team Access & Server Settings</h3>
              <p className="text-xs text-slate-500">Control team editing permissions for shared devices</p>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Server Name / Label</label>
              <input
                type="text"
                value={serverLabel}
                onChange={(e) => setServerLabel(e.target.value)}
                className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
              />
            </div>

            <div className="border border-slate-200 bg-slate-50 p-3 space-y-2.5">
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2">
                  {pinEnabled ? (
                    <Lock className="h-3.5 w-3.5 text-amber-700" />
                  ) : (
                    <Unlock className="h-3.5 w-3.5 text-emerald-700" />
                  )}
                  <span className="font-semibold text-slate-800">Require Team PIN to Save Edits</span>
                </div>
                <input
                  type="checkbox"
                  checked={pinEnabled}
                  onChange={(e) => setPinEnabled(e.target.checked)}
                  className="h-4 w-4 accent-amber-600"
                />
              </label>
              <p className="text-[11px] text-slate-600">
                {pinEnabled
                  ? 'Teammates can view everything, and must enter the shared PIN once to save or edit records.'
                  : 'Open Team Mode: Anyone with the share link can edit inventory, quotes, rentals, and slips immediately.'}
              </p>

              {pinEnabled && (
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    {serverInfo?.teamPinEnabled ? 'Update Team PIN (leave blank to keep current)' : 'Set Team Edit PIN *'}
                  </label>
                  <input
                    type="password"
                    value={pinValue}
                    onChange={(e) => setPinValue(e.target.value)}
                    placeholder="e.g. 2026"
                    className="w-full border border-slate-300 bg-white px-2.5 py-2 font-mono focus:border-amber-600 focus:outline-none"
                  />
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={savingSettings}
              onClick={handleSaveSettings}
              className="w-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
            >
              {savingSettings ? 'Saving...' : 'Save Server Settings'}
            </button>
          </div>
        </div>

        {/* Data Persistence, Backup & Restore */}
        <div className="lg:col-span-7 bg-white border border-slate-200 p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-sky-700" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Saved Server Data & Backups</h3>
                <p className="text-xs text-slate-500">
                  All team changes are automatically saved to disk in real time
                </p>
              </div>
            </div>
            {serverInfo && (
              <div className="text-right text-[11px] font-mono text-slate-600">
                <div>DB Size: {formatBytes(serverInfo.dbSizeBytes)}</div>
                <div>Uptime: {formatUptime(serverInfo.uptimeSeconds)}</div>
              </div>
            )}
          </div>

          {serverInfo && (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5 text-xs">
              <div className="border border-slate-200 p-2.5 bg-slate-50">
                <div className="text-slate-500">Equipment</div>
                <div className="font-mono text-base font-bold text-slate-900">{serverInfo.counts.inventory}</div>
              </div>
              <div className="border border-slate-200 p-2.5 bg-slate-50">
                <div className="text-slate-500">Clients</div>
                <div className="font-mono text-base font-bold text-slate-900">{serverInfo.counts.clients}</div>
              </div>
              <div className="border border-slate-200 p-2.5 bg-slate-50">
                <div className="text-slate-500">Quotes</div>
                <div className="font-mono text-base font-bold text-slate-900">{serverInfo.counts.quotes}</div>
              </div>
              <div className="border border-slate-200 p-2.5 bg-slate-50">
                <div className="text-slate-500">Rentals</div>
                <div className="font-mono text-base font-bold text-slate-900">{serverInfo.counts.rentals}</div>
              </div>
              <div className="border border-slate-200 p-2.5 bg-slate-50">
                <div className="text-slate-500">Drafts</div>
                <div className="font-mono text-base font-bold text-slate-900">{serverInfo.counts.drafts}</div>
              </div>
            </div>
          )}

          {/* Save Now to Main Server Box */}
          <div className="border border-emerald-200 bg-emerald-50/70 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-xs font-semibold text-emerald-950">
                Save &amp; Create Main Server Checkpoint
              </div>
              {serverInfo?.lastManualSaveAt && (
                <div className="text-[11px] font-mono text-emerald-800">
                  Last saved by {serverInfo.lastManualSaveBy} · {new Date(serverInfo.lastManualSaveAt).toLocaleString()}
                </div>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={saveLabel}
                onChange={(e) => setSaveLabel(e.target.value)}
                placeholder="Optional note (e.g. End of shift, Pre-loadout count)..."
                className="flex-1 border border-emerald-300 bg-white px-2.5 py-2 text-xs focus:border-emerald-700 focus:outline-none"
              />
              <button
                type="button"
                disabled={savingToServer}
                onClick={async () => {
                  await onSaveToServer(saveLabel.trim() || undefined);
                  setSaveLabel('');
                }}
                className="inline-flex items-center justify-center gap-1.5 bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 whitespace-nowrap cursor-pointer disabled:opacity-60"
              >
                <Save className="h-3.5 w-3.5" />
                {savingToServer ? 'Saving to Server...' : 'Save Data to Main Server'}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <a
              href="/api/backup/export"
              download
              className="inline-flex items-center gap-1.5 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              <Download className="h-3.5 w-3.5" />
              Export Team Backup (.json)
            </a>
            <a
              href="/api/backup/db"
              download
              className="inline-flex items-center gap-1.5 border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              <Database className="h-3.5 w-3.5" />
              Download SQLite DB (.db)
            </a>
            <button
              type="button"
              disabled={restoring}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 border border-amber-600 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5" />
              {restoring ? 'Restoring...' : 'Restore JSON Backup'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleRestoreFile(f);
              }}
            />
          </div>

          {serverInfo && (
            <div className="text-[11px] font-mono text-slate-500 truncate">
              Storage Path: {serverInfo.dbPath} · DB Modified: {new Date(serverInfo.lastSavedAt).toLocaleString()}
            </div>
          )}
        </div>
      </div>

      {/* Apple Devices, Safari App & Shortcuts / Swift REST API */}
      {(() => {
        const apiBase = selectedUrl || browserOrigin;
        const activeList = serverUsers.filter((u) => u.status === 'ACTIVE');
        const apiUser =
          activeList.find((u) => u.id === selectedApiUserId) ||
          activeList.find((u) => u.id === currentServerUserId) ||
          activeList[0];
        const token = apiUser?.inviteToken || 'host-owner-key';
        const maskedToken = showApiToken ? token : `${token.slice(0, 6)}••••••••••••`;
        const summaryCurl = `curl -H "Authorization: Bearer ${token}" "${apiBase}/api/apple/summary"`;
        const saveCurl = `curl -X POST -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" -d '{"label":"iPhone Shortcut Save"}' "${apiBase}/api/server/save"`;

        return (
          <div className="bg-white border border-slate-200">
            <div className="border-b border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Smartphone className="h-4 w-4 text-slate-800" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Apple Devices &amp; Mobile API (iPhone, iPad, Mac &amp; Shortcuts)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Use Safari &ldquo;Add to Home Screen&rdquo;, Apple Numbers CSV exports, or Bearer Token API in Apple Shortcuts &amp; Swift apps.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href="/api/apple/inventory.csv"
                  download
                  className="inline-flex items-center gap-1.5 border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" />
                  Apple Numbers CSV
                </a>
                <a
                  href="/api/apple/openapi.json"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                >
                  <Terminal className="h-3.5 w-3.5 text-sky-700" />
                  OpenAPI JSON
                </a>
              </div>
            </div>

            <div className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 text-xs">
              <div className="lg:col-span-5 space-y-3">
                <div className="border border-slate-200 bg-slate-50 p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900 inline-flex items-center gap-1.5">
                      <KeyRound className="h-3.5 w-3.5 text-amber-600" />
                      Bearer API Token (Per Server User)
                    </span>
                    <select
                      value={apiUser?.id ?? ''}
                      onChange={(e) => setSelectedApiUserId(Number(e.target.value))}
                      className="border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium focus:outline-none"
                    >
                      {activeList.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.accessLevel})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <code className="flex-1 border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-[11px] text-slate-800 truncate">
                      {maskedToken}
                    </code>
                    <button
                      type="button"
                      onClick={() => setShowApiToken((v) => !v)}
                      className="border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-100 cursor-pointer"
                      title={showApiToken ? 'Hide API Token' : 'Reveal API Token'}
                    >
                      {showApiToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(token, 'Bearer API token')}
                      className="inline-flex items-center gap-1 border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                    >
                      {copiedUrl === token ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                      Copy Key
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-600">
                    Send header <code className="bg-white border border-slate-200 px-1 font-mono">Authorization: Bearer &lt;token&gt;</code> or <code className="bg-white border border-slate-200 px-1 font-mono">X-API-Key</code>. Permissions (<code className="font-mono">EDITOR</code> / <code className="font-mono">VIEWER</code> / <code className="font-mono">REVOKED</code>) apply automatically.
                  </p>
                </div>

                <div className="border border-slate-200 p-3 space-y-1.5 bg-white">
                  <div className="font-semibold text-slate-900">Install on iPhone / iPad (Safari App Mode):</div>
                  <ol className="list-decimal list-inside space-y-1 text-slate-600 text-[11px]">
                    <li>Open your selected Server URL or Personal Invite Link in <strong>Safari</strong> on iPhone or iPad.</li>
                    <li>Tap the <strong>Share</strong> icon (square with upward arrow) and choose <strong>Add to Home Screen</strong>.</li>
                    <li>Launch <strong>KR-ONCUE POS</strong> full-screen like a native iOS app with automatic Wi-Fi wake sync.</li>
                  </ol>
                </div>
              </div>

              <div className="lg:col-span-7 space-y-3">
                <div className="border border-slate-200 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">Apple Shortcuts / iOS Widget Endpoints</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(`${apiBase}/api/apple/summary`, 'Apple Summary API URL')}
                      className="inline-flex items-center gap-1 border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                    >
                      <Copy className="h-3 w-3" />
                      Copy Summary URL
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                    <div className="bg-slate-50 border border-slate-200 p-2">
                      <div className="text-emerald-700 font-semibold">GET /api/apple/summary</div>
                      <div className="text-slate-500 font-sans">Live KPI totals, online users, active slips &amp; quotes</div>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 p-2">
                      <div className="text-sky-700 font-semibold">GET /api/apple/inventory.csv</div>
                      <div className="text-slate-500 font-sans">UTF-8 BOM spreadsheet ready for Apple Numbers</div>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 p-2">
                      <div className="text-amber-700 font-semibold">POST /api/server/save</div>
                      <div className="text-slate-500 font-sans">Trigger main server checkpoint from Shortcuts</div>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 p-2">
                      <div className="text-slate-800 font-semibold">GET /api/inventory · /api/rentals</div>
                      <div className="text-slate-500 font-sans">Full JSON equipment catalog &amp; rental records</div>
                    </div>
                  </div>
                </div>

                <div className="border border-slate-200 bg-slate-900 text-slate-100 p-3 space-y-2 font-mono text-[11px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-amber-400 font-semibold font-sans">Quick Test (macOS Terminal / Apple Shortcuts &ldquo;Get Contents of URL&rdquo;)</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(summaryCurl, 'Summary API cURL command')}
                      className="inline-flex items-center gap-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2 py-0.5 text-[10px] text-white cursor-pointer"
                    >
                      <Copy className="h-3 w-3" />
                      Copy Read
                    </button>
                  </div>
                  <div className="overflow-x-auto whitespace-nowrap text-emerald-300">{summaryCurl}</div>
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800">
                    <span className="text-slate-400 font-sans">Save to Main Server via API:</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(saveCurl, 'Save API cURL command')}
                      className="inline-flex items-center gap-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2 py-0.5 text-[10px] text-white cursor-pointer"
                    >
                      <Copy className="h-3 w-3" />
                      Copy Save
                    </button>
                  </div>
                  <div className="overflow-x-auto whitespace-nowrap text-sky-300">{saveCurl}</div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Saved Main Server Checkpoints History */}
      <div className="bg-white border border-slate-200">
        <div className="border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Saved Server Checkpoints</h3>
            <p className="text-xs text-slate-500">
              Any team member can click &ldquo;Save to Server&rdquo; to snapshot and flush all data to the host server
            </p>
          </div>
          <span className="font-mono text-xs text-slate-500">{serverSaves.length} savepoints</span>
        </div>
        {serverSaves.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            No manual server checkpoints yet. Click &ldquo;Save Data to Main Server&rdquo; above or in the top bar at any time.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                  <th className="px-4 py-2">Checkpoint Label</th>
                  <th className="px-4 py-2">Saved By</th>
                  <th className="px-4 py-2">Date &amp; Time</th>
                  <th className="px-4 py-2">Records</th>
                  <th className="px-4 py-2 text-right">Size</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {serverSaves.map((sp) => (
                  <tr key={sp.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-semibold text-slate-900">{sp.label}</td>
                    <td className="px-4 py-2.5 text-slate-700">{sp.savedBy}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-500">
                      {new Date(sp.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-slate-600">
                      {sp.counts.inventory ?? 0} gear · {sp.counts.quotes ?? 0} quotes · {sp.counts.rentals ?? 0} rentals · {sp.counts.clients ?? 0} clients
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-600">
                      {formatBytes(sp.sizeBytes)}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <a
                          href={`/api/server/saves/${sp.id}/download`}
                          download
                          className="inline-flex items-center gap-1 border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                        >
                          <Download className="h-3 w-3" />
                          JSON
                        </a>
                        <button
                          type="button"
                          disabled={restoring}
                          onClick={() => handleRestoreSavepoint(sp)}
                          className="inline-flex items-center gap-1 border border-amber-500 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 cursor-pointer"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Restore
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSavepoint(sp)}
                          className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                          title="Delete savepoint"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Live Team Activity Audit Feed */}
      <div className="bg-white border border-slate-200">
        <div className="border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Team Edit & Transaction Log</h3>
            <p className="text-xs text-slate-500">Every saved edit across all connected devices is recorded here</p>
          </div>
          <span className="font-mono text-xs text-slate-500">{activityLog.length} recent events</span>
        </div>

        <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 text-xs">
          {activityLog.length === 0 ? (
            <div className="p-6 text-center text-slate-500">
              No team activity recorded yet. Edits and transactions will appear here live.
            </div>
          ) : (
            activityLog.map((entry) => (
              <div key={entry.id} className="px-4 py-2.5 flex items-center justify-between gap-4 hover:bg-slate-50">
                <div className="min-w-0 flex items-center gap-2.5">
                  <span className="font-mono text-[10px] font-semibold uppercase px-1.5 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                    {entry.action}
                  </span>
                  <span className="font-semibold text-slate-900 shrink-0">{entry.actorName}</span>
                  <span className="text-slate-600 truncate">{entry.summary}</span>
                </div>
                <div className="font-mono text-[11px] text-slate-400 shrink-0">
                  {new Date(entry.createdAt).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
