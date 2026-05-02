/**
 * Browser-side mainnet reads for the custodial pubkey (fallback when API/RPC from the Worker is blocked or stale).
 * Uses the same RPC list pattern as the Worker: app `NEXT_PUBLIC_RPC_URL` first, then public endpoints.
 */
import { Connection, PublicKey } from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';

import { RPC_URL, SOLANA_NETWORK } from '@/lib/solana';

/** Native USDC mint for custodial SPL read (matches ecosystem tooling). */
const USDC_MINT_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_MINT_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEGERXfW9vpM8Xo';

function usdcMintBase58(): string {
  return SOLANA_NETWORK === 'devnet' ? USDC_MINT_DEVNET : USDC_MINT_MAINNET;
}

const PUBLIC_FALLBACKS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-rpc.publicnode.com',
  'https://rpc.ankr.com/solana',
];

function rpcCandidates(): string[] {
  const out: string[] = [];
  for (const u of [RPC_URL, ...PUBLIC_FALLBACKS]) {
    const s = String(u || '').trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

function rawToWholeUnits(totalRaw: bigint, decimals: number): number {
  const d = Math.min(9, Math.max(0, decimals));
  const div = BigInt(10) ** BigInt(d);
  if (div <= 0n) return Math.max(0, Number(totalRaw));
  const whole = totalRaw / div;
  if (whole > BigInt(Number.MAX_SAFE_INTEGER)) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, Number(whole));
}

async function sumMintRaw(
  connection: Connection,
  mint: PublicKey,
  owner: PublicKey,
): Promise<{ totalRaw: bigint; ok: boolean }> {
  let totalRaw = 0n;
  let anyOk = false;
  for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    try {
      const { value } = await connection.getParsedTokenAccountsByOwner(owner, { programId });
      anyOk = true;
      for (const row of value || []) {
        const raw = row.account.data;
        if (typeof raw !== 'object' || raw === null || !('parsed' in raw)) continue;
        const parsed = (raw as { parsed?: { type?: string; info?: Record<string, unknown> } }).parsed;
        if (!parsed || parsed.type !== 'account' || !parsed.info) continue;
        const info = parsed.info as {
          mint?: string;
          owner?: string;
          tokenAmount?: { amount?: string };
        };
        const m = String(info.mint || '').trim();
        const o = String(info.owner || '').trim();
        if (!m || !o) continue;
        let accMint: PublicKey;
        let accOwner: PublicKey;
        try {
          accMint = new PublicKey(m);
          accOwner = new PublicKey(o);
        } catch {
          continue;
        }
        if (!accMint.equals(mint) || !accOwner.equals(owner)) continue;
        totalRaw += BigInt(String(info.tokenAmount?.amount ?? '0'));
      }
    } catch {
      /* try next program */
    }
  }
  return { totalRaw, ok: anyOk };
}

async function tokenViaAta(
  connection: Connection,
  mint: PublicKey,
  owner: PublicKey,
  decimals: number,
): Promise<{ whole: number | null; ok: boolean }> {
  for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    try {
      const ata = getAssociatedTokenAddressSync(mint, owner, false, programId, ASSOCIATED_TOKEN_PROGRAM_ID);
      const bal = await connection.getTokenAccountBalance(ata);
      if (!bal?.value) continue;
      const ui = bal.value.uiAmount;
      if (ui != null && Number.isFinite(ui)) return { whole: Math.max(0, Math.floor(ui)), ok: true };
      if (bal.value.amount != null) {
        const raw = BigInt(String(bal.value.amount));
        const div = BigInt(10) ** BigInt(decimals);
        const whole = div > 0n ? raw / div : raw;
        return { whole: Math.max(0, Number(whole)), ok: true };
      }
    } catch {
      /* next */
    }
  }
  return { whole: 0, ok: true };
}

async function readOnce(
  rpcUrl: string,
  custodialB58: string,
  mintB58: string,
  decimals: number,
): Promise<{
  rrtt: number | null;
  lamports: number;
  solOk: boolean;
  tokenOk: boolean;
  usdcRaw: bigint;
  usdcOk: boolean;
}> {
  const connection = new Connection(rpcUrl, 'confirmed');
  const mint = new PublicKey(mintB58);
  const owner = new PublicKey(custodialB58);
  let lamports = 0;
  let solOk = false;
  try {
    lamports = await connection.getBalance(owner, 'confirmed');
    solOk = true;
  } catch {
    /* ignore */
  }
  let rrtt: number | null = null;
  const scan = await sumMintRaw(connection, mint, owner);
  let tokenOk = scan.ok;
  if (tokenOk) {
    rrtt = rawToWholeUnits(scan.totalRaw, decimals);
  } else {
    const fb = await tokenViaAta(connection, mint, owner, decimals);
    tokenOk = fb.ok;
    if (fb.ok && fb.whole != null) rrtt = fb.whole;
  }
  const usdcMint = new PublicKey(usdcMintBase58());
  const usdcScan = await sumMintRaw(connection, usdcMint, owner);
  return { rrtt, lamports, solOk, tokenOk, usdcRaw: usdcScan.totalRaw, usdcOk: usdcScan.ok };
}

export type CustodialChainBalances = {
  rrttWhole: number | null;
  lamports: number | null;
  solOk: boolean;
  tokenOk: boolean;
  /** USDC raw amount (10^6) when usdcOk. */
  usdcRaw: bigint | null;
  usdcOk: boolean;
  /** True if at least one leg read from RPC. */
  ok: boolean;
};

/**
 * Reads SOL + RRTT (whole units) for the custodial wallet on mainnet in the browser.
 */
export async function fetchCustodialMainnetBalances(
  custodialPubkeyB58: string,
  mintB58: string,
  decimals: number,
): Promise<CustodialChainBalances> {
  const dec = Math.min(9, Math.max(0, Math.floor(decimals) || 0));
  let rrttWhole: number | null = null;
  let lamports: number | null = null;
  let solOk = false;
  let tokenOk = false;
  let usdcRaw: bigint | null = null;
  let usdcOk = false;
  for (const url of rpcCandidates()) {
    try {
      const r = await readOnce(url, custodialPubkeyB58.trim(), mintB58.trim(), dec);
      // Do not return on first partial success: one endpoint may serve SPL reads but
      // rate-limit or drop getBalance; another may return SOL. Merge across candidates.
      if (r.solOk && !solOk) {
        solOk = true;
        lamports = r.lamports;
      }
      if (r.tokenOk && !tokenOk) {
        tokenOk = true;
        rrttWhole = r.rrtt;
      }
      if (r.usdcOk && !usdcOk) {
        usdcOk = true;
        usdcRaw = r.usdcRaw;
      }
      if (solOk && tokenOk && usdcOk) break;
    } catch {
      /* next RPC */
    }
  }
  const ok = solOk || tokenOk || usdcOk;
  return { rrttWhole, lamports, solOk, tokenOk, usdcRaw, usdcOk, ok };
}
