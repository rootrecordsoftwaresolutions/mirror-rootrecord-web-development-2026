import type { D1Database } from "@cloudflare/workers-types";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

export type CustodialCacheRpcEnv = {
  DB: D1Database;
  SOLANA_RPC_URL?: string;
  RRTT_MINT_BASE58?: string;
  RRTT_DECIMALS?: string;
};

/** Skip RPC if D1 cache was written this recently (avoids duplicate calls when /v1/me + /earn/summary load together). */
const CACHE_FRESH_MS = 12_000;

function isLikelyInfraRpcError(e: unknown): boolean {
  const s = e instanceof Error ? e.message : String(e);
  return /429|503|504|408|ECONNRESET|ETIMEDOUT|fetch failed|Too many|rate limit|socket hang|network/i.test(s);
}

function envDecimals(env: CustodialCacheRpcEnv): number {
  return Math.min(9, Math.max(0, Math.floor(Number(String(env.RRTT_DECIMALS || "9").trim()) || 9) || 0));
}

/**
 * Sum SPL raw amounts for `mint` across classic + Token-2022 program namespaces (matches sweep / cron discovery).
 */
async function sumMintRawForOwner(
  connection: Connection,
  mint: PublicKey,
  owner: PublicKey,
): Promise<{ totalRaw: bigint; ok: boolean }> {
  let totalRaw = 0n;
  let anyRpcSuccess = false;
  let infraFailures = 0;
  for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    try {
      const { value } = await connection.getParsedTokenAccountsByOwner(owner, { programId });
      anyRpcSuccess = true;
      for (const row of value || []) {
        const raw = row.account.data;
        if (typeof raw !== "object" || raw === null || !("parsed" in raw)) continue;
        const parsed = (raw as { parsed?: { type?: string; info?: Record<string, unknown> } }).parsed;
        if (!parsed || parsed.type !== "account" || !parsed.info) continue;
        const info = parsed.info as {
          mint?: string;
          owner?: string;
          tokenAmount?: { amount?: string };
        };
        const mintStr = String(info.mint || "").trim();
        const ownerStr = String(info.owner || "").trim();
        if (!mintStr || !ownerStr) continue;
        let accMint: PublicKey;
        let accOwner: PublicKey;
        try {
          accMint = new PublicKey(mintStr);
          accOwner = new PublicKey(ownerStr);
        } catch {
          continue;
        }
        if (!accMint.equals(mint) || !accOwner.equals(owner)) continue;
        totalRaw += BigInt(String(info.tokenAmount?.amount ?? "0"));
      }
    } catch (e) {
      if (isLikelyInfraRpcError(e)) infraFailures += 1;
      /* try next program; malformed responses are ignored */
    }
  }
  if (!anyRpcSuccess && infraFailures > 0) return { totalRaw: 0n, ok: false };
  return { totalRaw, ok: anyRpcSuccess };
}

/** Fallback: single ATA balance (classic then Token-2022 derivation). */
async function tokenBalanceViaAta(
  connection: Connection,
  mint: PublicKey,
  custodialPk: PublicKey,
  decimals: number,
): Promise<{ whole: number | null; ok: boolean }> {
  for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    try {
      const ata = getAssociatedTokenAddressSync(mint, custodialPk, false, programId, ASSOCIATED_TOKEN_PROGRAM_ID);
      const bal = await connection.getTokenAccountBalance(ata);
      if (!bal?.value) continue;
      const ui = bal.value.uiAmount;
      if (ui != null && Number.isFinite(ui)) {
        return { whole: Math.max(0, Math.floor(ui)), ok: true };
      }
      if (bal.value.amount != null) {
        const raw = BigInt(String(bal.value.amount));
        const div = BigInt(10) ** BigInt(decimals);
        const whole = div > 0n ? raw / div : raw;
        return { whole: Math.max(0, Number(whole)), ok: true };
      }
    } catch (e) {
      if (isLikelyInfraRpcError(e)) return { whole: null, ok: false };
    }
  }
  return { whole: 0, ok: true };
}

function rawToWholeUnits(totalRaw: bigint, decimals: number): number {
  const d = Math.min(9, Math.max(0, decimals));
  const div = BigInt(10) ** BigInt(d);
  if (div <= 0n) return Math.max(0, Number(totalRaw));
  const whole = totalRaw / div;
  if (whole > BigInt(Number.MAX_SAFE_INTEGER)) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, Number(whole));
}

/**
 * Reads custodial SPL + native SOL from mainnet RPC and writes `rr_earn_custodial_state` cache columns.
 * No-op when mint is unset or wallet row is missing. Throttled when `cache_updated_at` is very fresh.
 * Preserves existing D1 values when RPC fails (rate limits) so we do not zero the cache on errors.
 */
export async function refreshCustodialOnchainCacheFromRpc(
  env: CustodialCacheRpcEnv,
  accountId: string,
): Promise<{ custodial_rrtt_onchain: number | null; sol_balance_lamports_cached: number; refreshed: boolean } | null> {
  const mintStr = String(env.RRTT_MINT_BASE58 || "").trim();
  if (!mintStr) return null;
  const aid = String(accountId || "").trim();
  if (!aid) return null;

  const row = await env.DB
    .prepare("SELECT pubkey FROM internal_solana_wallets WHERE account_id = ?")
    .bind(aid)
    .first<{ pubkey: string }>();
  const pkStr = String(row?.pubkey || "").trim();
  if (!pkStr) return null;

  const staleRow = await env.DB
    .prepare("SELECT cache_updated_at FROM rr_earn_custodial_state WHERE account_id = ?")
    .bind(aid)
    .first<{ cache_updated_at: string | null }>();
  const ts = staleRow?.cache_updated_at ? Date.parse(String(staleRow.cache_updated_at)) : NaN;
  if (Number.isFinite(ts) && Date.now() - ts < CACHE_FRESH_MS) {
    const cur = await env.DB
      .prepare(
        "SELECT custodial_rrtt_onchain, sol_balance_lamports_cached FROM rr_earn_custodial_state WHERE account_id = ?",
      )
      .bind(aid)
      .first<{ custodial_rrtt_onchain: number | null; sol_balance_lamports_cached: number | null }>();
    return {
      custodial_rrtt_onchain:
        cur?.custodial_rrtt_onchain != null ? Math.max(0, Math.floor(Number(cur.custodial_rrtt_onchain) || 0)) : null,
      sol_balance_lamports_cached: Math.max(0, Math.floor(Number(cur?.sol_balance_lamports_cached) || 0)),
      refreshed: false,
    };
  }

  const decimals = envDecimals(env);
  const rpcUrl = String(env.SOLANA_RPC_URL || "").trim() || "https://api.mainnet-beta.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");
  const mint = new PublicKey(mintStr);
  const custodialPk = new PublicKey(pkStr);

  const prev = await env.DB
    .prepare(
      "SELECT custodial_rrtt_onchain, sol_balance_lamports_cached FROM rr_earn_custodial_state WHERE account_id = ?",
    )
    .bind(aid)
    .first<{ custodial_rrtt_onchain: number | null; sol_balance_lamports_cached: number | null }>();

  let nextOnchain: number | null =
    prev?.custodial_rrtt_onchain != null ? Math.max(0, Math.floor(Number(prev.custodial_rrtt_onchain) || 0)) : null;
  let nextSol = prev?.sol_balance_lamports_cached != null ? Math.max(0, Math.floor(Number(prev.sol_balance_lamports_cached) || 0)) : 0;

  let solOk = false;
  try {
    nextSol = await connection.getBalance(custodialPk, "confirmed");
    solOk = true;
  } catch (e) {
    if (!isLikelyInfraRpcError(e)) throw e;
    /* keep nextSol from D1 */
  }

  const scan = await sumMintRawForOwner(connection, mint, custodialPk);
  let tokenOk = scan.ok;
  if (tokenOk) {
    nextOnchain = rawToWholeUnits(scan.totalRaw, decimals);
  } else {
    const fb = await tokenBalanceViaAta(connection, mint, custodialPk, decimals);
    tokenOk = fb.ok;
    if (fb.ok && fb.whole != null) {
      nextOnchain = fb.whole;
    }
  }

  const nowIso = new Date().toISOString();
  await env.DB.prepare("INSERT OR IGNORE INTO rr_earn_custodial_state (account_id) VALUES (?)").bind(aid).run();

  if (!solOk && !tokenOk) {
    return {
      custodial_rrtt_onchain: nextOnchain,
      sol_balance_lamports_cached: nextSol,
      refreshed: false,
    };
  }

  await env.DB
    .prepare(
      `UPDATE rr_earn_custodial_state SET custodial_rrtt_onchain = ?, sol_balance_lamports_cached = ?, cache_updated_at = ? WHERE account_id = ?`,
    )
    .bind(tokenOk ? nextOnchain : prev?.custodial_rrtt_onchain ?? nextOnchain, solOk ? nextSol : prev?.sol_balance_lamports_cached ?? nextSol, nowIso, aid)
    .run();

  const after = await env.DB
    .prepare(
      "SELECT custodial_rrtt_onchain, sol_balance_lamports_cached FROM rr_earn_custodial_state WHERE account_id = ?",
    )
    .bind(aid)
    .first<{ custodial_rrtt_onchain: number | null; sol_balance_lamports_cached: number | null }>();

  return {
    custodial_rrtt_onchain:
      after?.custodial_rrtt_onchain != null ? Math.max(0, Math.floor(Number(after.custodial_rrtt_onchain) || 0)) : null,
    sol_balance_lamports_cached: Math.max(0, Math.floor(Number(after?.sol_balance_lamports_cached) || 0)),
    refreshed: true,
  };
}
