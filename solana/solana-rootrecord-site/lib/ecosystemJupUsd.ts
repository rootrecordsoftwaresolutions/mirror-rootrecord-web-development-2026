import {
  ECOSYSTEM_OTC_TOKEN_MINT,
  OTC_USD_PER_TOKEN,
  WSOL_MINT,
} from '@/lib/ecosystemOtcConstants';

export type JupiterUsdMark = {
  /** SOL / USD from Jupiter (only external mark we need). */
  solUsd: number;
  /**
   * Fixed at 1 for treasury transfer math: notion is locked in USD per token; USDC leg uses $1 = 1 USDC.
   * Not fetched from Jupiter.
   */
  usdcUsd: number;
  fetchedAt: number;
};

export type JupiterOtcPriceMark = JupiterUsdMark & {
  tokenMint: string;
  /** Jupiter USD per whole token, when listed; otherwise null and callers use {@link OTC_USD_PER_TOKEN}. */
  tokenUsd: number | null;
};

async function fetchJupiterTokenUsdV2Fallback(
  mint: string,
  init?: RequestInit,
): Promise<number | null> {
  const urls = [
    `https://lite-api.jup.ag/price/v2?ids=${encodeURIComponent(mint)}`,
    `https://api.jup.ag/price/v2?ids=${encodeURIComponent(mint)}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, init);
      if (!res.ok) continue;
      const json = (await res.json()) as {
        data?: Record<string, { price?: string | number }>;
      };
      const p = json.data?.[mint]?.price;
      const n = typeof p === 'number' ? p : parseFloat(String(p ?? ''));
      if (Number.isFinite(n) && n > 0) return n;
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * SOL/USD plus listing mint USD from Jupiter (v3 multi-id, v2 fallback for token only).
 * Use {@link resolveOtcUsdPerWholeToken} for tokenomics-style copy.
 */
export async function fetchJupiterOtcPriceMarks(init?: RequestInit): Promise<JupiterOtcPriceMark> {
  const tokenMint = ECOSYSTEM_OTC_TOKEN_MINT.trim();
  const url = `https://lite-api.jup.ag/price/v3?ids=${WSOL_MINT},${encodeURIComponent(tokenMint)}`;
  const r = await fetch(url, init);
  if (!r.ok) {
    throw new Error(`Jupiter price HTTP ${r.status}`);
  }
  const j = (await r.json()) as Record<string, { usdPrice?: number } | undefined>;
  const sol = j[WSOL_MINT]?.usdPrice;
  if (!Number.isFinite(sol) || sol == null || sol <= 0) {
    throw new Error('Invalid SOL USD mark');
  }
  const v3Tok = j[tokenMint]?.usdPrice;
  let tokenUsd: number | null =
    Number.isFinite(v3Tok) && v3Tok != null && v3Tok > 0 ? v3Tok : null;
  if (tokenUsd == null) {
    tokenUsd = await fetchJupiterTokenUsdV2Fallback(tokenMint, init);
  }
  return {
    solUsd: sol,
    usdcUsd: 1,
    fetchedAt: Date.now(),
    tokenMint,
    tokenUsd,
  };
}

export function resolveOtcUsdPerWholeToken(mark: JupiterOtcPriceMark): number {
  const t = mark.tokenUsd;
  if (Number.isFinite(t) && t != null && t > 0) return t;
  return OTC_USD_PER_TOKEN;
}

/** Trim trailing zeros for micro-cap token USD display. */
export function formatOtcUsdPerWholeToken(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return String(OTC_USD_PER_TOKEN);
  const s = usd.toFixed(12).replace(/\.?0+$/, '');
  return s.length ? s : String(usd);
}

/**
 * SOL/USD from Jupiter (v3 lite API, then v2 fallback). Lightweight for headers and small API routes.
 */
export async function fetchJupiterSolUsd(init?: RequestInit): Promise<number> {
  try {
    const url = `https://lite-api.jup.ag/price/v3?ids=${WSOL_MINT}`;
    const r = await fetch(url, init);
    if (r.ok) {
      const j = (await r.json()) as Record<string, { usdPrice?: number } | undefined>;
      const sol = j[WSOL_MINT]?.usdPrice;
      if (Number.isFinite(sol) && sol != null && sol > 0) return sol;
    }
  } catch {
    /* try v2 */
  }
  const v2 = await fetchJupiterTokenUsdV2Fallback(WSOL_MINT, init);
  if (v2 != null) return v2;
  throw new Error('SOL/USD unavailable');
}

/** Jupiter Price API — SOL only; same network request as {@link fetchJupiterOtcPriceMarks} under the hood. */
export async function fetchJupiterSolUsdcUsd(init?: RequestInit): Promise<JupiterUsdMark> {
  const m = await fetchJupiterOtcPriceMarks(init);
  return { solUsd: m.solUsd, usdcUsd: m.usdcUsd, fetchedAt: m.fetchedAt };
}
