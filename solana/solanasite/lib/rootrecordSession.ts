/**
 * RootRecord portal session (email/password) against rootrecord-primary `/v1/*`.
 * Used for custodial "web wallet" signing on the Solana tools site.
 */
export const PORTAL_TOKEN_KEY = 'rootrecord_portal_token';
/** Matches `Web/main/site-nav.js` — set when `/v1/me` indicates a lifetime member. */
export const PORTAL_LIFETIME_NAV_KEY = 'rootrecord_portal_lifetime_nav';
/** Same key as `Web/main/account.js` so device_id matches across portal HTML and Solana Tools. */
const PORTAL_DEVICE_ID_KEY = 'rootrecord_portal_device_id';
const LEGACY_DEVICE_ID_KEY = 'rootrecord_device_id';

export function getRootRecordApiBase(): string {
  const b = process.env.NEXT_PUBLIC_ROOTRECORD_API_BASE?.trim() || '';
  return b.replace(/\/+$/, '');
}

export function getPortalToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(PORTAL_TOKEN_KEY);
}

export function setPortalToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) localStorage.setItem(PORTAL_TOKEN_KEY, token);
  else localStorage.removeItem(PORTAL_TOKEN_KEY);
}

/** Same event name as `Web/main/site-nav.js` / `account.js` so tabs and this app stay in sync. */
export function notifyPortalAuthChange(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('rootrecord-portal-auth-change'));
  } catch {
    /* ignore */
  }
}

export function notifyPortalLifetimeNavChange(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('rootrecord-portal-lifetime-nav-change'));
  } catch {
    /* ignore */
  }
}

/** Clear portal token and lifetime nav hint (header + dropdown). */
export function clearPortalSession(): void {
  setPortalToken(null);
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(PORTAL_LIFETIME_NAV_KEY);
    } catch {
      /* ignore */
    }
  }
  notifyPortalAuthChange();
  notifyPortalLifetimeNavChange();
}

export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'ssr';
  let id = localStorage.getItem(PORTAL_DEVICE_ID_KEY);
  if (!id) {
    try {
      const legacy = localStorage.getItem(LEGACY_DEVICE_ID_KEY);
      if (legacy && legacy.length >= 8 && legacy.length <= 128) {
        id = legacy;
        localStorage.setItem(PORTAL_DEVICE_ID_KEY, id);
      }
    } catch {
      /* ignore */
    }
  }
  if (!id) {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    try {
      localStorage.setItem(PORTAL_DEVICE_ID_KEY, id);
    } catch {
      /* ignore */
    }
  }
  return id;
}

/** Match `account.js` `syncPortalLifetimeNav` for header Billing visibility. */
export function syncPortalLifetimeFromMe(data: Record<string, unknown> | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!data) {
      localStorage.removeItem(PORTAL_LIFETIME_NAV_KEY);
    } else if (data.life_member || data.lifeMember) {
      localStorage.setItem(PORTAL_LIFETIME_NAV_KEY, '1');
    } else {
      localStorage.removeItem(PORTAL_LIFETIME_NAV_KEY);
    }
    notifyPortalLifetimeNavChange();
  } catch {
    /* ignore */
  }
}

function u8ToB64(u8: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]!);
  return btoa(s);
}

function b64ToU8(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function rootrecordLogin(
  email: string,
  password: string,
): Promise<{ ok: true; access_token: string } | { ok: false; detail: string }> {
  const base = getRootRecordApiBase();
  if (!base) return { ok: false, detail: 'Account API is not configured (NEXT_PUBLIC_ROOTRECORD_API_BASE).' };
  const res = await fetch(`${base}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password,
      device_id: getOrCreateDeviceId(),
    }),
  });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const d = j.detail;
    return { ok: false, detail: typeof d === 'string' ? d : res.status === 401 ? 'Incorrect email or password.' : `HTTP ${res.status}` };
  }
  const access_token = j.access_token;
  if (typeof access_token !== 'string' || !access_token) {
    return { ok: false, detail: 'No access token in response' };
  }
  setPortalToken(access_token);
  notifyPortalAuthChange();
  return { ok: true, access_token };
}

export type CustodialInfo = {
  has_wallet: boolean;
  public_key: string | null;
  custodial_enabled: boolean;
};

export async function fetchCustodialInfo(token: string): Promise<CustodialInfo | null> {
  const base = getRootRecordApiBase();
  if (!base) return null;
  const res = await fetch(`${base}/v1/me/custodial-sol-wallet`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (j.ok !== true) return null;
  return {
    has_wallet: Boolean(j.has_wallet),
    public_key: typeof j.public_key === 'string' ? j.public_key : null,
    custodial_enabled: Boolean(j.custodial_enabled),
  };
}

export function emitCustodialNeedsAuth(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('rootrecord-custodial-needs-auth'));
}
