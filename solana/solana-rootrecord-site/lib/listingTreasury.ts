import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

/**
 * Server-only: listing / earn treasury keypair (same env names historically used for tooling).
 * Throws if secret is missing or invalid.
 */
export function loadListingTreasuryKeypair(): Keypair {
  const raw =
    process.env.ECOSYSTEM_OTC_TREASURY_PRIVATE_KEY?.trim() ||
    process.env.ECOSYSTEM_OTC_TREASURY_SECRET_KEY?.trim();
  if (!raw) {
    throw new Error('ECOSYSTEM_OTC_TREASURY_PRIVATE_KEY is not set');
  }
  try {
    const arr = JSON.parse(raw) as unknown;
    if (Array.isArray(arr) && arr.length === 64) {
      return Keypair.fromSecretKey(Uint8Array.from(arr as number[]));
    }
  } catch {
    /* base58 below */
  }
  const decoded = bs58.decode(raw);
  if (decoded.length === 64) {
    return Keypair.fromSecretKey(decoded);
  }
  throw new Error('ECOSYSTEM_OTC_TREASURY_PRIVATE_KEY is not valid JSON array or base58 secret');
}
