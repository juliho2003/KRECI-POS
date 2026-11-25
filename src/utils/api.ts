export interface OperatorProfile {
  clientId: string;
  serverUserId?: number;
  inviteToken?: string;
  name: string;
  role: string;
  color: string;
}

const PROFILE_KEY = 'kr_oncue_operator_profile';
const PIN_KEY = 'kr_oncue_team_pin';

const AVATAR_COLORS = [
  '#d97706', // amber-600
  '#0284c7', // sky-600
  '#059669', // emerald-600
  '#7c3aed', // violet-600
  '#dc2626', // red-600
  '#db2777', // pink-600
  '#0d9488', // teal-600
];

function generateClientId(): string {
  return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function getOperatorProfile(): OperatorProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<OperatorProfile>;
      if (parsed.name && parsed.clientId) {
        return {
          clientId: parsed.clientId,
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
  const suffix = Math.floor(10 + Math.random() * 89);
  const initial: OperatorProfile = {
    clientId: generateClientId(),
    name: `Operator ${suffix}`,
    role: 'Team Member',
    color: AVATAR_COLORS[suffix % AVATAR_COLORS.length],
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

export function getStoredTeamPin(): string {
  try {
    return localStorage.getItem(PIN_KEY) || '';
  } catch {
    return '';
  }
}

export function setStoredTeamPin(pin: string): void {
  try {
    if (pin) {
      localStorage.setItem(PIN_KEY, pin);
    } else {
      localStorage.removeItem(PIN_KEY);
    }
  } catch {
    // ignore
  }
}

let pinPromptHandler: (() => void) | null = null;

export function registerPinPromptHandler(fn: () => void): () => void {
  pinPromptHandler = fn;
  return () => {
    if (pinPromptHandler === fn) pinPromptHandler = null;
  };
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const profile = getOperatorProfile();
  const pin = getStoredTeamPin();
  const headers = new Headers(init.headers);
  headers.set('X-Operator-Name', encodeURIComponent(profile.name));
  headers.set('X-Client-Id', profile.clientId);
  if (profile.serverUserId) {
    headers.set('X-Server-User-Id', String(profile.serverUserId));
  }
  if (profile.inviteToken) {
    headers.set('Authorization', `Bearer ${profile.inviteToken}`);
  }
  if (pin) {
    headers.set('X-Team-Pin', pin);
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(input, { ...init, headers });
  if (res.status === 401 && pinPromptHandler) {
    pinPromptHandler();
  }
  return res;
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
