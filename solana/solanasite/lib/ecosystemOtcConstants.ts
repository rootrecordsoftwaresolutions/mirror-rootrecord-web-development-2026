/** Treasury Transfer Tool output mint (same default as ecosystem page). */
export const ECOSYSTEM_OTC_TOKEN_MINT =
  process.env.NEXT_PUBLIC_ECOSYSTEM_TOKEN_MINT?.trim() ||
  '6KfGKe13ASrV5WHvChbapQXxxEFRNqwpwrdEVsX6RQMT';

/** Metaplex listing symbol for the ecosystem mint — keep in sync with on-chain metadata. */
export const ECOSYSTEM_LISTING_SYMBOL = 'RRTT';

/** Metaplex listing name for the ecosystem mint — keep in sync with on-chain metadata. */
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
 * For ecosystem page Solscan links only; treasury-transfer auto-LP uses SOL/USDC pools above.
 */
export const ECOSYSTEM_SOLSCAN_CPMM_POOL_JUP_RRTT =
  process.env.NEXT_PUBLIC_ECOSYSTEM_OTC_CPMM_POOL_ID_JUP?.trim() ||
  'HvEZGms9in7HerDEjfFh9Mwf4DncVeyiu3WNJ7UFJMuv';

/**
 * Raydium CPMM pool state — RAY / RRTT.
 * For ecosystem page Solscan links only; treasury-transfer auto-LP uses SOL/USDC pools above.
 */
export const ECOSYSTEM_SOLSCAN_CPMM_POOL_RAY_RRTT =
  process.env.NEXT_PUBLIC_ECOSYSTEM_OTC_CPMM_POOL_ID_RAY?.trim() ||
  'G9aR6NvZK794wo1tzfFnEP8j6THynSrB7UmuYDi4CuN3';

/** @deprecated Alias for `ECOSYSTEM_SOLSCAN_CPMM_POOL_SOL` (WSOL pair). */
export const ECOSYSTEM_SOLSCAN_CPMM_POOL = ECOSYSTEM_SOLSCAN_CPMM_POOL_SOL;

function ecosystemOtcCpmmPoolIdLegacy(): string {
  return (
    process.env.ECOSYSTEM_OTC_CPMM_POOL_ID?.trim() ||
    process.env.NEXT_PUBLIC_ECOSYSTEM_OTC_CPMM_POOL_ID?.trim() ||
    ''
  );
}

/**
 * Raydium CPMM pool id for treasury-transfer auto-LP: separate pools for WSOL vs USDC quote.
 * Falls back to legacy `ECOSYSTEM_OTC_CPMM_POOL_ID` when the split env for that rail is unset.
 */
export function resolveOtcCpmmPoolId(payWith: 'SOL' | 'USDC'): string {
  const legacy = ecosystemOtcCpmmPoolIdLegacy();
  if (payWith === 'SOL') {
    const sol =
      process.env.ECOSYSTEM_OTC_CPMM_POOL_ID_SOL?.trim() ||
      process.env.NEXT_PUBLIC_ECOSYSTEM_OTC_CPMM_POOL_ID_SOL?.trim() ||
      '';
    return sol || legacy;
  }
  const usdc =
    process.env.ECOSYSTEM_OTC_CPMM_POOL_ID_USDC?.trim() ||
    process.env.NEXT_PUBLIC_ECOSYSTEM_OTC_CPMM_POOL_ID_USDC?.trim() ||
    '';
  return usdc || legacy;
}

/** Treasury wallet shown on ecosystem / tokenomics (Solscan). */
export const ECOSYSTEM_SOLSCAN_TREASURY =
  process.env.NEXT_PUBLIC_ECOSYSTEM_SOLSCAN_TREASURY?.trim() ||
  '3QG6gVk3fdimzQaKX9zf7J6kCs5DRLKg1RNea3VBosDJ';

/** Developer / operations wallet (Solscan). */
export const ECOSYSTEM_SOLSCAN_DEVELOPER =
  process.env.NEXT_PUBLIC_ECOSYSTEM_SOLSCAN_DEVELOPER?.trim() ||
  'HCeCfMAAZeFUaBQrzC2t84myrBnvnb3h8M26k4urv2X1';

export const solscanAccount = (pubkey: string) =>
  `https://solscan.io/account/${pubkey.trim()}`;

export const solscanToken = (mint: string) => `https://solscan.io/token/${mint.trim()}`;

export const OTC_USD_PER_TOKEN = 0.00002;

const QUOTE_RETAIN_BPS_MAX = 9_999;

/**
 * Basis points of received SOL/USDC kept in treasury (not sent to CPMM add-liquidity).
 * Default 100 = 1% for transfer fees and later LP adds. Override with ECOSYSTEM_OTC_QUOTE_RETAIN_BPS.
 */
export function ecosystemOtcQuoteRetainBps(): number {
  const raw =
    process.env.ECOSYSTEM_OTC_QUOTE_RETAIN_BPS?.trim() ||
    process.env.NEXT_PUBLIC_ECOSYSTEM_OTC_QUOTE_RETAIN_BPS?.trim();
  const n = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > QUOTE_RETAIN_BPS_MAX) return 100;
  return Math.trunc(n);
}

/** e.g. "1%" or "0.75%" for UI copy. */
export function ecosystemOtcQuoteRetainPercentLabel(): string {
  const b = ecosystemOtcQuoteRetainBps();
  if (b % 100 === 0) return `${b / 100}%`;
  return `${(b / 100).toFixed(2)}%`;
}

/** Lamports or micro-USDC to deposit into CPMM after applying ecosystemOtcQuoteRetainBps. */
export function ecosystemOtcQuoteAmountForLpDeposit(raw: bigint): bigint {
  if (raw <= 0n) return 0n;
  const retain = BigInt(ecosystemOtcQuoteRetainBps());
  const depositBps = 10_000n - retain;
  return (raw * depositBps) / 10_000n;
}

export const WSOL_MINT = 'So11111111111111111111111111111111111111112';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const DEVNET_USDC_DEFAULT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEGERXfW9vpM8Xo';

/** USDC mint for treasury transfer payment verification and pool matching (aligns with launch tool env). */
export function ecosystemOtcUsdcMint(): string {
  const trimmed = process.env.NEXT_PUBLIC_LAUNCH_USDC_MINT?.trim();
  if (trimmed) return trimmed;
  const net = process.env.NEXT_PUBLIC_SOLANA_NETWORK?.trim() || 'mainnet-beta';
  return net === 'devnet' ? DEVNET_USDC_DEFAULT : USDC_MINT;
}
