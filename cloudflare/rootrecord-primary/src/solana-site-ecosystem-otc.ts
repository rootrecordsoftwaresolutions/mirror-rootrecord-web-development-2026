import type { D1Database } from "@cloudflare/workers-types";

import { json } from "./cors";

export type SolanaSiteEcosystemOtcEnv = {
  DB: D1Database;
  SOLANA_SITE_LOG_SECRET?: string;
  /** Shown on public earn→custodial history rows (same mint as OTC listing when configured). */
  RRTT_MINT_BASE58?: string;
};

const MAX_SIG = 128;
const MAX_ADDR = 64;
const MAX_RAW = 64;
const MAX_PAY = 8;
const MAX_TX = 128;

function trim(s: unknown, max: number): string {
  return String(s ?? "")
    .trim()
    .slice(0, max);
}

function looksLikeTxSig(s: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{80,128}$/.test(s);
}

function looksLikePubkey(s: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
}

function requireBearer(request: Request, env: SolanaSiteEcosystemOtcEnv): Response | null {
  const expected = String(env.SOLANA_SITE_LOG_SECRET || "").trim();
  if (!expected) {
    return json({ ok: false, detail: "solana_site_log_not_configured" }, 503);
  }
  const auth = request.headers.get("Authorization") || "";
  if (auth !== `Bearer ${expected}`) {
    return json({ ok: false, detail: "unauthorized" }, 401);
  }
  return null;
}

/**
 * GET /api/solana-site/ecosystem-otc-history — public (no Bearer); bounded limit.
 * POST /api/solana-site/ecosystem-otc-* — Bearer SOLANA_SITE_LOG_SECRET (same as site log).
 */
export async function handleSolanaSiteEcosystemOtcRoutes(
  request: Request,
  env: SolanaSiteEcosystemOtcEnv,
  sub: string,
  method: string
): Promise<Response | null> {
  if (sub === "/solana-site/ecosystem-otc-history" && method === "GET") {
    const u = new URL(request.url);
    const limRaw = u.searchParams.get("limit") || "80";
    const lim = Math.min(200, Math.max(1, Math.floor(Number(limRaw)) || 80));
    try {
      const { results } = await env.DB.prepare(
        `SELECT payment_tx_signature, buyer, token_mint, amount_raw, pay_with, out_tx, liquidity_tx, quote_received_raw, tokens_whole, token_decimals, created_at
         FROM ecosystem_otc_fulfillments
         ORDER BY datetime(created_at) DESC
         LIMIT ?`
      )
        .bind(lim)
        .all<{
          payment_tx_signature: string;
          buyer: string;
          token_mint: string;
          amount_raw: string;
          pay_with: string;
          out_tx: string | null;
          liquidity_tx: string | null;
          quote_received_raw: string | null;
          tokens_whole: string | null;
          token_decimals: string | null;
          created_at: string;
        }>();

      let custodial_sweep_rows: {
        id: string;
        created_at: string;
        out_tx_signature: string;
        custodial_wallet_b58: string;
        units_whole: number;
        token_mint: string | null;
      }[] = [];
      try {
        const mintHint = trim(env.RRTT_MINT_BASE58, MAX_ADDR) || null;
        const sweep = await env.DB.prepare(
          `SELECT l.id, l.created_at, l.tx_signature AS out_tx_signature, l.units AS units_whole,
                  COALESCE(NULLIF(TRIM(l.recipient_pubkey), ''), iw.pubkey) AS custodial_wallet_b58
           FROM rr_earn_custodial_ledger l
           LEFT JOIN internal_solana_wallets iw ON iw.account_id = l.account_id
           WHERE l.kind = 'treasury_to_custodial' AND l.direction = 'in'
             AND l.tx_signature IS NOT NULL AND TRIM(l.tx_signature) != ''
           ORDER BY datetime(l.created_at) DESC
           LIMIT ?`
        )
          .bind(lim)
          .all<{
            id: string;
            created_at: string;
            out_tx_signature: string;
            units_whole: number;
            custodial_wallet_b58: string;
          }>();
        custodial_sweep_rows = (sweep.results ?? []).map((r) => ({
          id: r.id,
          created_at: r.created_at,
          out_tx_signature: r.out_tx_signature,
          custodial_wallet_b58: String(r.custodial_wallet_b58 || "").trim(),
          units_whole: Math.max(0, Math.floor(Number(r.units_whole) || 0)),
          token_mint: mintHint,
        }));
      } catch (e2) {
        const m2 = e2 instanceof Error ? e2.message : String(e2);
        if (!/no such table|no such column/i.test(m2)) {
          console.error("ecosystem-otc-history custodial sweep query", m2);
        }
      }

      return json(
        {
          ok: true,
          rows: results ?? [],
          custodial_sweep_rows,
        },
        200,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "query_failed";
      const isMissingTable = /no such table/i.test(msg);
      return json(
        {
          ok: false,
          detail: isMissingTable
            ? "ecosystem_otc_fulfillments table missing — apply D1 migrations 0012+0013"
            : msg,
        },
        isMissingTable ? 503 : 500
      );
    }
  }

  if (sub === "/solana-site/ecosystem-otc-reserve" && method === "POST") {
    const authErr = requireBearer(request, env);
    if (authErr) return authErr;
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return json({ ok: false, detail: "invalid_json" }, 400);
    }
    const payment_tx_signature = trim(body.payment_tx_signature, MAX_SIG);
    const buyer = trim(body.buyer, MAX_ADDR);
    const token_mint = trim(body.token_mint, MAX_ADDR);
    const amount_raw = trim(body.amount_raw, MAX_RAW);
    const pay_with = trim(body.pay_with, MAX_PAY).toUpperCase();
    const tokens_whole = body.tokens_whole != null ? trim(body.tokens_whole, 32) : null;
    const token_decimals = body.token_decimals != null ? trim(body.token_decimals, 8) : null;
    if (!looksLikeTxSig(payment_tx_signature)) {
      return json({ ok: false, detail: "invalid_payment_tx_signature" }, 400);
    }
    if (!looksLikePubkey(buyer) || !looksLikePubkey(token_mint)) {
      return json({ ok: false, detail: "invalid_buyer_or_mint" }, 400);
    }
    if (!amount_raw || !/^\d+$/.test(amount_raw)) {
      return json({ ok: false, detail: "invalid_amount_raw" }, 400);
    }
    if (pay_with !== "SOL" && pay_with !== "USDC") {
      return json({ ok: false, detail: "invalid_pay_with" }, 400);
    }
    try {
      const existing = await env.DB.prepare(
        "SELECT payment_tx_signature FROM ecosystem_otc_fulfillments WHERE payment_tx_signature = ? LIMIT 1"
      )
        .bind(payment_tx_signature)
        .first<{ payment_tx_signature: string }>();
      if (existing?.payment_tx_signature) {
        return json({ ok: false, detail: "payment_tx_already_used" }, 409);
      }
      await env.DB.prepare(
        `INSERT INTO ecosystem_otc_fulfillments (payment_tx_signature, buyer, token_mint, amount_raw, pay_with, tokens_whole, token_decimals)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          payment_tx_signature,
          buyer,
          token_mint,
          amount_raw,
          pay_with,
          tokens_whole,
          token_decimals
        )
        .run();
      return json({ ok: true }, 200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "insert_failed";
      if (/UNIQUE constraint|unique constraint/i.test(msg)) {
        return json({ ok: false, detail: "payment_tx_already_used" }, 409);
      }
      return json({ ok: false, detail: msg }, 500);
    }
  }

  if (sub === "/solana-site/ecosystem-otc-release" && method === "POST") {
    const authErr = requireBearer(request, env);
    if (authErr) return authErr;
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return json({ ok: false, detail: "invalid_json" }, 400);
    }
    const payment_tx_signature = trim(body.payment_tx_signature, MAX_SIG);
    if (!looksLikeTxSig(payment_tx_signature)) {
      return json({ ok: false, detail: "invalid_payment_tx_signature" }, 400);
    }
    try {
      await env.DB.prepare("DELETE FROM ecosystem_otc_fulfillments WHERE payment_tx_signature = ? AND out_tx IS NULL")
        .bind(payment_tx_signature)
        .run();
      return json({ ok: true }, 200);
    } catch (e) {
      return json({ ok: false, detail: e instanceof Error ? e.message : "delete_failed" }, 500);
    }
  }

  if (sub === "/solana-site/ecosystem-otc-complete" && method === "POST") {
    const authErr = requireBearer(request, env);
    if (authErr) return authErr;
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return json({ ok: false, detail: "invalid_json" }, 400);
    }
    const payment_tx_signature = trim(body.payment_tx_signature, MAX_SIG);
    const out_tx = trim(body.out_tx, MAX_TX);
    if (!looksLikeTxSig(payment_tx_signature) || !looksLikeTxSig(out_tx)) {
      return json({ ok: false, detail: "invalid_signatures" }, 400);
    }
    try {
      const r = await env.DB.prepare(
        "UPDATE ecosystem_otc_fulfillments SET out_tx = ? WHERE payment_tx_signature = ?"
      )
        .bind(out_tx, payment_tx_signature)
        .run();
      if (!r.success) {
        return json({ ok: false, detail: "update_failed" }, 500);
      }
      return json({ ok: true }, 200);
    } catch (e) {
      return json({ ok: false, detail: e instanceof Error ? e.message : "update_failed" }, 500);
    }
  }

  if (sub === "/solana-site/ecosystem-otc-liquidity-meta" && method === "POST") {
    const authErr = requireBearer(request, env);
    if (authErr) return authErr;
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return json({ ok: false, detail: "invalid_json" }, 400);
    }
    const payment_tx_signature = trim(body.payment_tx_signature, MAX_SIG);
    const liquidity_tx =
      body.liquidity_tx === null || body.liquidity_tx === undefined
        ? null
        : trim(body.liquidity_tx, MAX_TX) || null;
    const quote_received_raw = trim(body.quote_received_raw, MAX_RAW);
    if (!looksLikeTxSig(payment_tx_signature)) {
      return json({ ok: false, detail: "invalid_payment_tx_signature" }, 400);
    }
    if (!quote_received_raw || !/^\d+$/.test(quote_received_raw)) {
      return json({ ok: false, detail: "invalid_quote_received_raw" }, 400);
    }
    try {
      await env.DB.prepare(
        "UPDATE ecosystem_otc_fulfillments SET liquidity_tx = ?, quote_received_raw = ? WHERE payment_tx_signature = ?"
      )
        .bind(liquidity_tx, quote_received_raw, payment_tx_signature)
        .run();
      return json({ ok: true }, 200);
    } catch (e) {
      return json({ ok: false, detail: e instanceof Error ? e.message : "update_failed" }, 500);
    }
  }

  return null;
}
