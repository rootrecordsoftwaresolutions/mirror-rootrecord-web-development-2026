import type { D1Database } from "@cloudflare/workers-types";

import { json } from "./cors";

export type SolanaSiteRecentTokensEnv = {
  DB: D1Database;
};

type Row = {
  mint: string;
  name: string | null;
  symbol: string | null;
  token2022: number;
  created_at: string;
  wallet: string;
};

/**
 * GET /api/solana-site/recent-tokens?limit=50 — public JSON for Next `/recent-tokens` SSR.
 * No auth. Served on the Worker (not forwarded to Vercel).
 */
export async function handleSolanaSiteRecentTokensRoute(
  env: SolanaSiteRecentTokensEnv,
  sub: string,
  method: string,
  searchParams: URLSearchParams
): Promise<Response | null> {
  if (sub !== "/solana-site/recent-tokens" || method !== "GET") return null;

  const rawLimit = searchParams.get("limit");
  let limit = 50;
  if (rawLimit != null && rawLimit !== "") {
    const n = Number(rawLimit);
    if (Number.isFinite(n)) limit = Math.min(100, Math.max(1, Math.floor(n)));
  }

  try {
    const stmt = env.DB.prepare(
      `SELECT mint, name, symbol, token2022, created_at, wallet
       FROM solana_site_token_create
       ORDER BY datetime(created_at) DESC
       LIMIT ?`
    );
    const { results } = await stmt.bind(limit).all<Row>();

    const tokens = (results || []).map((r) => ({
      mint: r.mint,
      name: r.name,
      symbol: r.symbol,
      token2022: r.token2022 === 1,
      created_at: r.created_at,
      wallet: r.wallet,
    }));

    return json({ ok: true, tokens }, 200, {
      "Cache-Control": "public, max-age=60, s-maxage=60",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "query_failed";
    return json({ ok: false, detail: msg }, 500);
  }
}
