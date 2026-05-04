import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';

export type ListedSplMint = {
  mint: string;
  label: string;
  decimals: number;
};

function shortMint(m: string): string {
  const t = m.trim();
  if (t.length <= 14) return t;
  return `${t.slice(0, 6)}…${t.slice(-4)}`;
}

function pushParsedRows(
  value: readonly { account: { data: unknown } }[],
  labelPrefix: string,
  out: Map<string, ListedSplMint>,
): void {
  for (const row of value || []) {
    const raw = row.account.data;
    if (typeof raw !== 'object' || raw === null || !('parsed' in raw)) continue;
    const parsed = (raw as { parsed?: { type?: string; info?: Record<string, unknown> } }).parsed;
    if (!parsed || parsed.type !== 'account' || !parsed.info) continue;
    const info = parsed.info as {
      mint?: string;
      tokenAmount?: { amount?: string; uiAmount?: number | null; decimals?: number };
    };
    const mint = String(info.mint || '').trim();
    if (!mint) continue;
    let mintPk: PublicKey;
    try {
      mintPk = new PublicKey(mint);
    } catch {
      continue;
    }
    const amountStr = String(info.tokenAmount?.amount ?? '0');
    let rawBn = 0n;
    try {
      rawBn = BigInt(amountStr);
    } catch {
      rawBn = 0n;
    }
    if (rawBn <= 0n) continue;

    const ui = info.tokenAmount?.uiAmount;
    const dec =
      typeof info.tokenAmount?.decimals === 'number' && Number.isFinite(info.tokenAmount.decimals)
        ? Math.max(0, Math.min(18, Math.trunc(info.tokenAmount.decimals)))
        : 9;
    const uiLabel =
      ui != null && Number.isFinite(ui) && Math.abs(ui) > 0
        ? Number(ui) >= 1
          ? ui.toLocaleString('en-US', { maximumFractionDigits: 6 })
          : ui.toLocaleString('en-US', { maximumSignificantDigits: 4 })
        : `raw ${amountStr.slice(0, 12)}…`;

    const label = `${labelPrefix}${shortMint(mintPk.toBase58())} · ${uiLabel}`;
    out.set(mintPk.toBase58(), { mint: mintPk.toBase58(), label, decimals: dec });
  }
}

/** SPL / Token-2022 mints the owner holds with on-chain balance &gt; 0 (one row per mint). */
export async function listSplMintsForOwner(
  connection: Connection,
  owner: PublicKey,
  labelPrefix = '',
): Promise<ListedSplMint[]> {
  const out = new Map<string, ListedSplMint>();
  for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    try {
      const { value } = await connection.getParsedTokenAccountsByOwner(owner, { programId });
      pushParsedRows(value, labelPrefix, out);
    } catch {
      /* ignore per program */
    }
  }
  return [...out.values()].sort((a, b) => a.label.localeCompare(b.label));
}
