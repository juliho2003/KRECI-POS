export interface OperatorProfile {
  clientId: string;
  deviceId: string;
  deviceName: string;
  serverUserId?: number;
  inviteToken?: string;
  name: string;
  role: string;
  color: string;
}

const PROFILE_KEY = 'kr_oncue_operator_profile';
const DEVICE_ID_KEY = 'kr_oncue_device_id';

const AVATAR_COLORS = [
  '#d97706', // amber-600
  '#0284c7', // sky-600
  '#059669', // emerald-600
  '#7c3aed', // violet-600
  '#dc2626', // red-600
  '#db2777', // pink-600
  '#0d9488', // teal-600
];

function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing && existing.trim()) {
      return existing.trim();
    }
    const created = generateId('dev');
    localStorage.setItem(DEVICE_ID_KEY, created);
    return created;
  } catch {
    return generateId('dev');
  }
}

export function detectDeviceName(): string {
  if (typeof navigator === 'undefined') return 'Web Browser';
  const ua = navigator.userAgent || '';

  let osLabel = 'Device';
  if (/iPhone/i.test(ua)) osLabel = 'iPhone';
  else if (/iPad/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) osLabel = 'iPad';
  else if (/Android/i.test(ua)) osLabel = 'Android';
  else if (/Macintosh|Mac OS X/i.test(ua)) osLabel = 'Mac';
  else if (/Windows/i.test(ua)) osLabel = 'Windows PC';
  else if (/Linux/i.test(ua)) osLabel = 'Linux';

  let browserLabel = 'Browser';
  if (/Edg\//i.test(ua)) browserLabel = 'Edge';
  else if (/CriOS\//i.test(ua) || (/Chrome\//i.test(ua) && !/Edg\//i.test(ua))) browserLabel = 'Chrome';
  else if (/FxiOS\//i.test(ua) || /Firefox\//i.test(ua)) browserLabel = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browserLabel = 'Safari';

  return `${osLabel} · ${browserLabel}`;
}

export function getOperatorProfile(): OperatorProfile {
  const deviceId = getOrCreateDeviceId();
  const deviceName = detectDeviceName();
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<OperatorProfile>;
      const isLegacyAutoName =
        !parsed.serverUserId && !parsed.inviteToken && /^Operator \d{2}$/.test(parsed.name || '');
      if (parsed.name && parsed.clientId && !isLegacyAutoName) {
        return {
          clientId: parsed.clientId,
          deviceId: parsed.deviceId || deviceId,
          deviceName: parsed.deviceName || deviceName,
          serverUserId: parsed.serverUserId,
          inviteToken: parsed.inviteToken,
          name: parsed.name,
          role: parsed.role || 'Team Member',
          color: parsed.color || AVATAR_COLORS[0],
        };
      }
    }
  } catch {
    // ignore storage errors
  }
  const initial: OperatorProfile = {
    clientId: deviceId,
    deviceId,
    deviceName,
    name: '',
    role: 'Team Member',
    color: AVATAR_COLORS[0],
  };
  saveOperatorProfile(initial);
  return initial;
}

export function saveOperatorProfile(profile: OperatorProfile): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // ignore storage errors
  }
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const profile = getOperatorProfile();
  const headers = new Headers(init.headers);
  headers.set('X-Operator-Name', encodeURIComponent(profile.name || 'Team Member'));
  headers.set('X-Client-Id', profile.clientId);
  headers.set('X-Device-Id', profile.deviceId);
  headers.set('X-Device-Name', profile.deviceName);
  if (profile.serverUserId) {
    headers.set('X-Server-User-Id', String(profile.serverUserId));
  }
  if (profile.inviteToken) {
    headers.set('Authorization', `Bearer ${profile.inviteToken}`);
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(input, { ...init, headers });
}

export async function copyTextSafe(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // iOS / macOS Safari on http:// LAN IPs rejects navigator.clipboard; fall through to execCommand
    }
  }
  if (typeof document === 'undefined') return false;
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export async function shareLinkNative(
  title: string,
  text: string,
  url: string
): Promise<'shared' | 'copied' | 'failed'> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        return 'failed';
      }
      // Fall through to copy on unsupported platforms
    }
  }
  const copied = await copyTextSafe(url);
  return copied ? 'copied' : 'failed';
}
