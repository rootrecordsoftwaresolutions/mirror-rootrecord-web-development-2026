import type { D1Database } from "@cloudflare/workers-types";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
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

/**
 * Reads custodial SPL + native SOL from mainnet RPC and writes `rr_earn_custodial_state` cache columns.
 * No-op when mint is unset or wallet row is missing. Throttled when `cache_updated_at` is very fresh.
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

  const decimals = Math.min(9, Math.max(0, Math.floor(Number(env.RRTT_DECIMALS ?? "0")) || 0));
  const rpcUrl = String(env.SOLANA_RPC_URL || "").trim() || "https://api.mainnet-beta.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");
  const mint = new PublicKey(mintStr);
  const custodialPk = new PublicKey(pkStr);
  const ata = getAssociatedTokenAddressSync(mint, custodialPk, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

  const bal = await connection.getTokenAccountBalance(ata).catch(() => null);
  const lamports = await connection.getBalance(custodialPk, "confirmed").catch(() => 0);

  let onchain: number | null = null;
  if (bal?.value) {
    const ui = bal.value.uiAmount;
    if (ui != null && Number.isFinite(ui)) {
      onchain = Math.floor(ui);
    } else if (bal.value.amount != null) {
      const raw = Math.floor(Number(bal.value.amount) || 0);
      const div = decimals > 0 ? 10 ** decimals : 1;
      onchain = Math.floor(raw / div);
    }
  }

  const nowIso = new Date().toISOString();
  await env.DB.prepare("INSERT OR IGNORE INTO rr_earn_custodial_state (account_id) VALUES (?)").bind(aid).run();
  await env.DB
    .prepare(
      `UPDATE rr_earn_custodial_state SET custodial_rrtt_onchain = ?, sol_balance_lamports_cached = ?, cache_updated_at = ? WHERE account_id = ?`,
    )
    .bind(onchain, lamports, nowIso, aid)
    .run();

  return {
    custodial_rrtt_onchain: onchain,
    sol_balance_lamports_cached: lamports,
    refreshed: true,
  };
}
