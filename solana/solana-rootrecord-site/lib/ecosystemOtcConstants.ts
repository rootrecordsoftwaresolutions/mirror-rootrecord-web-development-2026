/** Default SPL mint for RRTT listing (override with NEXT_PUBLIC_ECOSYSTEM_TOKEN_MINT). */
export const ECOSYSTEM_OTC_TOKEN_MINT =
  process.env.NEXT_PUBLIC_ECOSYSTEM_TOKEN_MINT?.trim() ||
  '6KfGKe13ASrV5WHvChbapQXxxEFRNqwpwrdEVsX6RQMT';

/** Metaplex listing symbol — keep in sync with on-chain metadata. */
export const ECOSYSTEM_LISTING_SYMBOL = 'RRTT';

/** Metaplex listing name — keep in sync with on-chain metadata. */
export const ECOSYSTEM_LISTING_NAME = 'Root Record Treasury Token';

/** Raydium CPMM pool state — SOL / WSOL quote leg (Solscan account). */
export const ECOSYSTEM_SOLSCAN_CPMM_POOL_SOL =
  process.env.NEXT_PUBLIC_ECOSYSTEM_OTC_CPMM_POOL_ID_SOL?.trim() ||
  process.env.NEXT_PUBLIC_ECOSYSTEM_OTC_CPMM_POOL_ID?.trim() ||
  'CJPypGffPA7xf9rPy7HhuLQSx7FZUpYgrSXYMuiTHuJr';

/** Raydium CPMM pool state — USDC quote leg (mainnet default from on-chain Raydium CPMM listing). */
export const ECOSYSTEM_SOLSCAN_CPMM_POOL_USDC =
  process.env.NEXT_PUBLIC_ECOSYSTEM_OTC_CPMM_POOL_ID_USDC?.trim() ||
  'FDWS5gABvxMfPrBEqUREbBmwBsajKuzDhqJ4LVgSNWT3';

/**
 * Raydium CPMM pool state — JUP / RRTT (Jupiter token quote).
 * For tokenomics Solscan links.
 */
export const ECOSYSTEM_SOLSCAN_CPMM_POOL_JUP_RRTT =
  process.env.NEXT_PUBLIC_ECOSYSTEM_OTC_CPMM_POOL_ID_JUP?.trim() ||
  'HvEZGms9in7HerDEjfFh9Mwf4DncVeyiu3WNJ7UFJMuv';

/**
 * Raydium CPMM pool state — RAY / RRTT.
 * For tokenomics Solscan links.
 */
export const ECOSYSTEM_SOLSCAN_CPMM_POOL_RAY_RRTT =
  process.env.NEXT_PUBLIC_ECOSYSTEM_OTC_CPMM_POOL_ID_RAY?.trim() ||
  'G9aR6NvZK794wo1tzfFnEP8j6THynSrB7UmuYDi4CuN3';

/** @deprecated Alias for `ECOSYSTEM_SOLSCAN_CPMM_POOL_SOL` (WSOL pair). */
export const ECOSYSTEM_SOLSCAN_CPMM_POOL = ECOSYSTEM_SOLSCAN_CPMM_POOL_SOL;

/** Treasury wallet shown on tokenomics (Solscan). */
export const ECOSYSTEM_SOLSCAN_TREASURY =
  process.env.NEXT_PUBLIC_ECOSYSTEM_SOLSCAN_TREASURY?.trim() ||
  '3QG6gVk3fdimzQaKX9zf7J6kCs5DRLKg1RNea3VBosDJ';

/** Developer / operations wallet (Solscan). */
export const ECOSYSTEM_SOLSCAN_DEVELOPER =
  process.env.NEXT_PUBLIC_ECOSYSTEM_SOLSCAN_DEVELOPER?.trim() ||
  'HCeCfMAAZeFUaBQrzC2t84myrBnvnb3h8M26k4urv2X1';

/**
 * RRESERVE SPL mint (pool leg / accounting token).
 * Override with NEXT_PUBLIC_ECOSYSTEM_RRESERVE_TOKEN_MINT if it moves.
 */
export const ECOSYSTEM_RRESERVE_TOKEN_MINT =
  process.env.NEXT_PUBLIC_ECOSYSTEM_RRESERVE_TOKEN_MINT?.trim() ||
  '5FNiQb4cFcD8wBkivXpeoB5xYb3R6ohU8Y5nKmMRB362';

/**
 * RRESERVE / RRTT pair account (pool state on Solscan).
 * Override with NEXT_PUBLIC_ECOSYSTEM_SOLSCAN_RRESERVE if it moves.
 */
export const ECOSYSTEM_SOLSCAN_RRESERVE =
  process.env.NEXT_PUBLIC_ECOSYSTEM_SOLSCAN_RRESERVE?.trim() ||
  '9aZ7EEqGHefwvozfjN3PUzBYiDGxgicqjkTgVvjbYUJA';

/** Max whole RRESERVE tokens minted (pool-side accounting token; 1 : RRESERVE_RRTT_RATIO_DENOMINATOR vs RRTT). */
export const RRESERVE_TOKEN_SUPPLY_CAP = 100;

/** Reserve accounting ratio: 1 RRESERVE token matches this many RRTT atomic units (smallest SPL unit). */
export const RRESERVE_RRTT_RATIO_DENOMINATOR = 10_000_000;

export const solscanAccount = (pubkey: string) =>
  `https://solscan.io/account/${pubkey.trim()}`;

export const solscanToken = (mint: string) => `https://solscan.io/token/${mint.trim()}`;

/**
 * USD per whole listing token when Jupiter has no USD mark (feeds down / not listed).
 * Tokenomics fallback only; live marks come from Jupiter when available.
 */
export const OTC_USD_PER_TOKEN = 0.00001;

/** Wrapped SOL mint (Jupiter price id). */
export const WSOL_MINT = 'So11111111111111111111111111111111111111112';
