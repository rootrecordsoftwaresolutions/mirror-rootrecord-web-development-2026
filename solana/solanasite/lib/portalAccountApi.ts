/**
 * RootRecord portal account API — same routes as `Web/main/account.js` (rootrecord-primary `/v1/*`).
 */

import { getRootRecordApiBase } from '@/lib/rootrecordSession';

/** Must match first line in `Web/cloudflare/rootrecord-primary/src/solana-linked-wallet.ts`. */
export const SOLANA_LINK_WALLET_MESSAGE_PREFIX = 'RootRecord account wallet link';

export function buildSolanaWalletLinkMessage(accountId: string, walletB58: string): string {
  const issued = new Date().toISOString();
  return [
    SOLANA_LINK_WALLET_MESSAGE_PREFIX,
    `account_id:${accountId}`,
    `wallet:${walletB58}`,
    `issued:${issued}`,
  ].join('\n');
}

const BETA_EARN_APP_ID = 'rootrecord_weather_manager_android';

function looksTechnicalMessage(s: string): boolean {
  /* Use INTERNAL_ not INTERNAL — otherwise benign phrases like "Internal wallet" are hidden from users. */
  return /[`{}[\]]|STRIPE_|WORKER|LICENSE_|\/v1\/|INTERNAL_|D1\b|Cloudflare|ROOTRECORD_|Bearer |webhook|price_id|secret_key|operator\b|site-config/i.test(
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
  if (msg && msg.length < 400 && !looksTechnicalMessage(msg)) {
    if (msg === 'not_found') {
      return 'That account API path is not available. Deploy the latest rootrecord-primary Worker or check NEXT_PUBLIC_ROOTRECORD_API_BASE.';
    }
    return msg;
  }
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

export type EarnSummary = { balance: number; balance_display?: number } & Record<string, unknown>;

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

export async function portalLinkWallet(
  token: string,
  body: { pubkey: string; message: string; signature: string },
): Promise<{ ok: true } | { ok: false; status: number; detail: string }> {
  const base = getRootRecordApiBase();
  if (!base) return { ok: false, status: 503, detail: 'Account API is not configured.' };
  const res = await fetch(`${base}/v1/me/linked-wallet`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const { j } = await parsePortalJson(res);
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      detail: friendlyPortalApiError(j) || 'Could not link this wallet.',
    };
  }
  return { ok: true };
}

export async function portalCreateCustodialWallet(
  token: string,
): Promise<{ ok: true } | { ok: false; status: number; detail: string }> {
  const base = getRootRecordApiBase();
  if (!base) return { ok: false, status: 503, detail: 'Account API is not configured.' };
  const res = await fetch(`${base}/v1/me/custodial-sol-wallet`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const { j } = await parsePortalJson(res);
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      detail: friendlyPortalApiError(j) || 'Could not create custodial wallet.',
    };
  }
  return { ok: true };
}

/** Matches `rr_earn_custodial_ledger` rows from GET `/v1/me/rewards-ledger`. */
export type RewardsLedgerAppSnapshot = {
  per_app_totals_at_transfer: { app_id: string; total_units: number }[];
  attributed_to_this_transfer: { app_id: string; units: number }[];
};

export type RewardsLedgerTransaction = {
  id: string;
  kind: string;
  direction: string;
  units: number;
  tx_signature: string | null;
  recipient_pubkey: string | null;
  app_snapshot: RewardsLedgerAppSnapshot;
  earn_balance_snapshot: number | null;
  notes: string | null;
  created_at: string;
};

export type RewardsLedgerPage = {
  ok: boolean;
  total: number;
  limit: number;
  offset: number;
  solana_cluster: string;
  explorer_tx_base: string;
  transactions: RewardsLedgerTransaction[];
};

export async function fetchRewardsLedger(
  token: string,
  opts?: { limit?: number; offset?: number },
): Promise<{ ok: true; data: RewardsLedgerPage } | { ok: false; status: number; detail: string }> {
  const base = getRootRecordApiBase();
  if (!base) return { ok: false, status: 503, detail: 'Account API is not configured.' };
  const limit = Math.min(200, Math.max(1, Math.floor(opts?.limit ?? 50)));
  const offset = Math.max(0, Math.floor(opts?.offset ?? 0));
  const url = `${base}/v1/me/rewards-ledger?limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const { j } = await parsePortalJson(res);
  if (res.status === 401) return { ok: false, status: 401, detail: 'Session expired.' };
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      detail: friendlyPortalApiError(j) || 'Could not load rewards history.',
    };
  }
  const total = Math.max(0, Math.floor(Number(j.total) || 0));
  const lim = Math.max(1, Math.floor(Number(j.limit) || limit));
  const off = Math.max(0, Math.floor(Number(j.offset) || offset));
  const explorer_tx_base =
    typeof j.explorer_tx_base === 'string' && j.explorer_tx_base.trim()
      ? j.explorer_tx_base.trim()
      : 'https://solscan.io/tx/';
  const solana_cluster = typeof j.solana_cluster === 'string' ? j.solana_cluster : 'mainnet-beta';
  const rawTx = j.transactions;
  const transactions: RewardsLedgerTransaction[] = Array.isArray(rawTx)
    ? rawTx.map((row) => {
        const o = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
        const snap = o.app_snapshot;
        let app_snapshot: RewardsLedgerAppSnapshot = {
          per_app_totals_at_transfer: [],
          attributed_to_this_transfer: [],
        };
        if (snap && typeof snap === 'object' && snap !== null) {
          const s = snap as Record<string, unknown>;
          const per = Array.isArray(s.per_app_totals_at_transfer) ? s.per_app_totals_at_transfer : [];
          const att = Array.isArray(s.attributed_to_this_transfer) ? s.attributed_to_this_transfer : [];
          app_snapshot = {
            per_app_totals_at_transfer: per
              .map((x) => {
                const r = x && typeof x === 'object' ? (x as Record<string, unknown>) : {};
                return {
                  app_id: String(r.app_id || '').trim(),
                  total_units: Math.max(0, Math.floor(Number(r.total_units) || 0)),
                };
              })
              .filter((x) => x.app_id),
            attributed_to_this_transfer: att
              .map((x) => {
                const r = x && typeof x === 'object' ? (x as Record<string, unknown>) : {};
                return {
                  app_id: String(r.app_id || '').trim(),
                  units: Math.max(0, Math.floor(Number(r.units) || 0)),
                };
              })
              .filter((x) => x.app_id),
          };
        }
        return {
          id: String(o.id || ''),
          kind: String(o.kind || ''),
          direction: String(o.direction || ''),
          units: Math.max(0, Math.floor(Number(o.units) || 0)),
          tx_signature: o.tx_signature == null ? null : String(o.tx_signature),
          recipient_pubkey: o.recipient_pubkey == null ? null : String(o.recipient_pubkey),
          app_snapshot,
          earn_balance_snapshot:
            o.earn_balance_snapshot == null ? null : Math.floor(Number(o.earn_balance_snapshot) || 0),
          notes: o.notes == null ? null : String(o.notes),
          created_at: String(o.created_at || ''),
        };
      })
    : [];
  const data: RewardsLedgerPage = {
    ok: Boolean(j.ok !== false),
    total,
    limit: lim,
    offset: off,
    solana_cluster,
    explorer_tx_base,
    transactions,
  };
  return { ok: true, data };
}

export async function portalSaveWithdrawDest(
  token: string,
  withdraw_dest_pubkey: string | null,
): Promise<{ ok: true } | { ok: false; detail: string }> {
  const base = getRootRecordApiBase();
  if (!base) return { ok: false, detail: 'Account API is not configured.' };
  const res = await fetch(`${base}/v1/me/custodial-withdraw-dest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ withdraw_dest_pubkey }),
  });
  const { j } = await parsePortalJson(res);
  if (!res.ok) {
    return { ok: false, detail: friendlyPortalApiError(j) || 'Could not save withdrawal address.' };
  }
  return { ok: true };
}

export async function portalWithdrawRrtt(
  token: string,
  opts?: { amount_whole?: number; destination_pubkey?: string | null },
): Promise<
  | { ok: true; tx_signature: string; amount_whole: number; destination: string }
  | { ok: false; detail: string; tx_signature?: string }
> {
  const base = getRootRecordApiBase();
  if (!base) return { ok: false, detail: 'Account API is not configured.' };
  const body: Record<string, unknown> = {};
  if (opts?.amount_whole != null && Number.isFinite(opts.amount_whole) && opts.amount_whole > 0) {
    body.amount_whole = Math.floor(opts.amount_whole);
  }
  if (opts?.destination_pubkey !== undefined) {
    body.destination_pubkey = opts.destination_pubkey;
  }
  const res = await fetch(`${base}/v1/me/custodial-withdraw-rrtt`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const { j } = await parsePortalJson(res);
  if (!res.ok || j?.ok === false) {
    const detail = friendlyPortalApiError(j) || 'Could not withdraw RRTT.';
    const tx = typeof j?.tx_signature === 'string' ? j.tx_signature : undefined;
    return { ok: false, detail, tx_signature: tx };
  }
  return {
    ok: true,
    tx_signature: String(j?.tx_signature || ''),
    amount_whole: Math.max(0, Math.floor(Number(j?.amount_whole) || 0)),
    destination: String(j?.destination || ''),
  };
}

export async function portalUnlinkWallet(
  token: string,
): Promise<{ ok: true } | { ok: false; detail: string }> {
  const base = getRootRecordApiBase();
  if (!base) return { ok: false, detail: 'Account API is not configured.' };
  const res = await fetch(`${base}/v1/me/linked-wallet`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const { j } = await parsePortalJson(res);
  if (!res.ok) {
    return { ok: false, detail: friendlyPortalApiError(j) || 'Could not unlink wallet.' };
  }
  return { ok: true };
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
