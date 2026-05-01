import BN from 'bn.js';
import { NATIVE_MINT } from '@solana/spl-token';
import type { Keypair } from '@solana/web3.js';

import {
  ECOSYSTEM_OTC_TOKEN_MINT,
  ecosystemOtcQuoteAmountForLpDeposit,
  ecosystemOtcUsdcMint,
  resolveOtcCpmmPoolId,
} from '@/lib/ecosystemOtcConstants';
import {
  addCpmmLiquidityWithKeypair,
  coerceRaydiumPoolByIdList,
  isCpmmPoolItem,
  loadRaydiumForKeypair,
} from '@/lib/raydiumCpmmLaunch';

/**
 * Deposit the treasury transfer quote payment (SOL or USDC) into the Raydium CPMM pool that matches
 * the payment rail (WSOL pool vs USDC pool), from the treasury keypair. A configurable share of the
 * quote stays in treasury (default 1%) for fees and later LP.
 */
export async function depositOtcPaymentToCpmmPool(params: {
  treasury: Keypair;
  tokenMint: string;
  payWith: 'SOL' | 'USDC';
  /** Native SOL received by treasury (lamports). */
  receivedSol: bigint;
  /** USDC raw units received by treasury. */
  receivedUsdc: bigint;
}): Promise<{ txId: string }> {
  const poolId = resolveOtcCpmmPoolId(params.payWith);
  if (!poolId) {
    const hint =
      params.payWith === 'SOL'
        ? 'Set ECOSYSTEM_OTC_CPMM_POOL_ID_SOL or legacy ECOSYSTEM_OTC_CPMM_POOL_ID (WSOL pair).'
        : 'Set ECOSYSTEM_OTC_CPMM_POOL_ID_USDC or legacy ECOSYSTEM_OTC_CPMM_POOL_ID (USDC pair).';
    throw new Error(`OTC CPMM pool id is not set for ${params.payWith} deposits. ${hint}`);
  }

  const tokenMint = params.tokenMint.trim();
  const quoteMint = params.payWith === 'SOL' ? NATIVE_MINT.toBase58() : ecosystemOtcUsdcMint();

  const { raydium } = await loadRaydiumForKeypair(params.treasury);
  const list = coerceRaydiumPoolByIdList(
    await raydium.api.fetchPoolById({ ids: poolId }),
  );
  const poolInfo = list.find(isCpmmPoolItem);
  if (!poolInfo) {
    throw new Error('Treasury transfer pool id is not a Raydium CPMM pool on this cluster');
  }

  const hasToken =
    poolInfo.mintA.address === tokenMint || poolInfo.mintB.address === tokenMint;
  if (!hasToken) {
    throw new Error('Treasury transfer pool does not include the configured token mint');
  }

  const quoteIsA = poolInfo.mintA.address === quoteMint;
  const quoteIsB = poolInfo.mintB.address === quoteMint;
  if (!quoteIsA && !quoteIsB) {
    throw new Error('Treasury transfer pool quote side must be WSOL (SOL) or USDC to match payment');
  }

  const received = params.payWith === 'SOL' ? params.receivedSol : params.receivedUsdc;
  const raw = ecosystemOtcQuoteAmountForLpDeposit(received);
  if (raw <= 0n) {
    throw new Error('No quote amount to add to the pool (after treasury reserve)');
  }

  const inputAmount = new BN(raw.toString());
  const baseIn = quoteIsA;

  return addCpmmLiquidityWithKeypair(params.treasury, {
    poolId,
    inputAmount,
    baseIn,
    slippageBps: 150,
  });
}
