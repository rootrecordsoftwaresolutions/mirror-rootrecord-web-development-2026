/**
 * RootRecord portal account API — same routes as `Web/main/account.js` (rootrecord-primary `/v1/*`).
 */

import { getRootRecordApiBase } from '@/lib/rootrecordSession';

const BETA_EARN_APP_ID = 'rootrecord_weather_manager_android';

function looksTechnicalMessage(s: string): boolean {
  return /[`{}[\]]|STRIPE_|WORKER|LICENSE_|\/v1\/|INTERNAL|D1\b|Cloudflare|ROOTRECORD_|Bearer |webhook|price_id|secret_key|operator\b|site-config/i.test(
    s,
  );
}

export function friendlyPortalApiError(j: Record<string, unknown>): string {
  const detail = typeof j.detail === 'string' ? j.detail.trim() : '';
  if (detail && detail.length < 400 && !looksTechnicalMessage(detail)) return detail;
  const topMsg = typeof j.message === 'string' ? j.message.trim() : '';
  if (topMsg && topMsg.length < 400 && !looksTechnicalMessage(topMsg)) return topMsg;
  const err = j.error;
  const msg =
    err && typeof err === 'object' && err !== null && typeof (err as { message?: string }).message === 'string'
      ? String((err as { message: string }).message).trim()
      : typeof err === 'string'
        ? err.trim()
        : '';
  if (msg && msg.length < 400 && !looksTechnicalMessage(msg)) return msg;
  return '';
}

export async function parsePortalJson(res: Response): Promise<{ j: Record<string, unknown>; text: string }> {
  const text = await res.text();
  let j: Record<string, unknown> = {};
  try {
    j = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    j = {};
  }
  return { j, text };
}

export type PortalMeData = Record<string, unknown>;

export async function fetchPortalMe(token: string): Promise<{ ok: true; data: PortalMeData } | { ok: false; status: number }> {
  const base = getRootRecordApiBase();
  if (!base) return { ok: false, status: 503 };
  const res = await fetch(`${base}/v1/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) return { ok: false, status: 401 };
  if (!res.ok) return { ok: false, status: res.status };
  const data = (await res.json().catch(() => ({}))) as PortalMeData;
  return { ok: true, data };
}

export type EarnSummary = { balance: number } & Record<string, unknown>;

export async function fetchEarnSummary(token: string): Promise<EarnSummary | null> {
  const base = getRootRecordApiBase();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/api/earn/summary?app_id=${encodeURIComponent(BETA_EARN_APP_ID)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!j || typeof j !== 'object') return null;
    const n = Number(j.balance);
    if (!Number.isFinite(n)) return null;
    return { ...j, balance: n };
  } catch {
    return null;
  }
}

export async function portalSignup(
  email: string,
  password: string,
  deviceId: string,
): Promise<{ ok: true; access_token: string } | { ok: false; detail: string }> {
  const base = getRootRecordApiBase();
  if (!base) return { ok: false, detail: 'Account API is not configured (NEXT_PUBLIC_ROOTRECORD_API_BASE).' };
  const res = await fetch(`${base}/v1/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password,
      device_id: deviceId,
    }),
  });
  const { j, text } = await parsePortalJson(res);
  if (!res.ok) {
    let human = friendlyPortalApiError(j);
    if (!human && text && text.length < 400 && !/<!DOCTYPE/i.test(text) && !looksTechnicalMessage(text)) {
      human = text.trim();
    }
    return { ok: false, detail: human || 'We could not create an account. Check your details and try again.' };
  }
  const access_token = j.access_token;
  if (typeof access_token !== 'string' || !access_token) {
    return { ok: false, detail: 'No access token in response' };
  }
  return { ok: true, access_token };
}

export async function portalLogout(token: string): Promise<void> {
  const base = getRootRecordApiBase();
  if (!base) return;
  try {
    await fetch(`${base}/v1/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    /* ignore */
  }
}

export async function portalDeleteAccount(
  token: string,
): Promise<{ ok: true } | { ok: false; detail: string }> {
  const base = getRootRecordApiBase();
  if (!base) return { ok: false, detail: 'Account API is not configured.' };
  const res = await fetch(`${base}/v1/me`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const { j } = await parsePortalJson(res);
  if (!res.ok) {
    return { ok: false, detail: friendlyPortalApiError(j) || 'Could not delete your account.' };
  }
  return { ok: true };
}

export function planLabelFromMe(data: PortalMeData): string {
  if (data.life_member || data.lifeMember) return 'Lifetime';
  const v = String(data.subscription_status || '').toLowerCase();
  if (v === 'active') return 'Active';
  if (v === 'past_due') return 'Past due';
  if (v === 'canceled') return 'Canceled';
  if (v === 'trialing' || v === 'trial') return 'Trial';
  if (v === 'none' || !v) {
    if (data.pro_unlocked || data.proUnlocked) return 'Pro';
    return 'Free';
  }
  return String(data.subscription_status || '—');
}

export function formatAccountCreatedAt(data: PortalMeData): string {
  const raw = String(data.account_created_at || data.accountCreatedAt || '').trim();
  if (!raw) return '—';
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return raw;
  try {
    return new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return raw;
  }
}
