import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
  type Cluster,
} from '@solana/web3.js';
import {
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createInitializeMint2Instruction,
  getMinimumBalanceForRentExemptMint,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  AuthorityType,
  getMint,
  getAccount,
  createBurnCheckedInstruction,
  createFreezeAccountInstruction,
  createThawAccountInstruction,
} from '@solana/spl-token';
import {
  createCreateMetadataAccountV3Instruction,
  createUpdateMetadataAccountV2Instruction,
  Metadata as MetaplexMetadata,
  PROGRAM_ID as METADATA_PROGRAM_ID,
} from '@metaplex-foundation/mpl-token-metadata';
import type { WalletContextState } from '@solana/wallet-adapter-react';

import {
  appendReferralMemoIfEligible,
  appendReferralMemoToTransaction,
  eligibleReferrerForPayer,
} from '@/lib/referralMemo';
import {
  ECOSYSTEM_SOLSCAN_DEVELOPER,
  ECOSYSTEM_SOLSCAN_TREASURY,
} from '@/lib/ecosystemOtcConstants';

export const SOLANA_NETWORK = (process.env.NEXT_PUBLIC_SOLANA_NETWORK ||
  'mainnet-beta') as Cluster;

const DEFAULT_RPC = 'https://api.mainnet-beta.solana.com';

/** Avoid Invalid URL / prerender crashes when Vercel env is mistyped or missing scheme. */
function resolveRpcUrl(): string {
  const trimmed = process.env.NEXT_PUBLIC_RPC_URL?.trim();
  if (!trimmed) return DEFAULT_RPC;
  try {
    const withProto = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const u = new URL(withProto);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return DEFAULT_RPC;
    return u.toString();
  } catch {
    return DEFAULT_RPC;
  }
}

export const RPC_URL = resolveRpcUrl();

export const FEE_WALLET_STR = process.env.NEXT_PUBLIC_FEE_WALLET || '';

/** Values treated as “not configured” for fee collection. */
const FEE_WALLET_PLACEHOLDERS = new Set([
  '',
  'YOUR_FEE_WALLET_PUBKEY_HERE',
  'YourActualFeeWalletPubkeyHere',
]);

function parseFeeSol(env: string | undefined, fallback: number): number {
  const n = parseFloat(env ?? '');
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export const CREATE_FEE_SOL = parseFeeSol(
  process.env.NEXT_PUBLIC_CREATE_FEE_SOL,
  0.025,
);
export const ACTION_FEE_SOL = parseFeeSol(
  process.env.NEXT_PUBLIC_ACTION_FEE_SOL,
  0.01,
);

/** Basis points of each platform fee sent to an eligible referrer (same tx). Default 1000 = 10%. */
function parseReferralShareBps(): number {
  const n = parseInt(process.env.NEXT_PUBLIC_REFERRAL_SHARE_BPS ?? '', 10);
  if (Number.isFinite(n) && n >= 0 && n <= 10_000) return n;
  return 1000;
}

export const REFERRAL_FEE_SHARE_BPS = parseReferralShareBps();
/** RootRecord service charge for the Raydium pool launch tool (first tx, before pool creation). */
export const LAUNCH_FEE_SOL = parseFeeSol(
  process.env.NEXT_PUBLIC_LAUNCH_FEE_SOL,
  0.05,
);

/** RootRecord service charge for adding liquidity to an existing CPMM pool (first tx, before Raydium deposit). */
export const ADD_LIQUIDITY_FEE_SOL = parseFeeSol(
  process.env.NEXT_PUBLIC_ADD_LIQUIDITY_FEE_SOL,
  0.005,
);

/** RootRecord service charge for removing liquidity from an existing CPMM pool (first tx, before Raydium withdraw). */
export const REMOVE_LIQUIDITY_FEE_SOL = parseFeeSol(
  process.env.NEXT_PUBLIC_REMOVE_LIQUIDITY_FEE_SOL,
  0.005,
);

/** RootRecord fee per account frozen or thawed in the bulk tool (same tx as the SPL instructions). */
export const FREEZE_THAW_FEE_PER_ADDRESS_SOL = parseFeeSol(
  process.env.NEXT_PUBLIC_FREEZE_THAW_FEE_PER_ADDRESS_SOL,
  0.0005,
);

/** SPL freeze/thaw instructions per transaction (legacy tx size; fee + memo share the budget). */
const FREEZE_THAW_BULK_IX_PER_TX = 12;

/** Raydium mainnet CPMM pool-creation fee (SOL); informational — from Raydium public `createPoolFee`. */
export const RAYDIUM_MAINNET_CPMM_POOL_CREATE_FEE_SOL = 0.15;

export function getConnection(): Connection {
  return new Connection(RPC_URL, 'confirmed');
}

function getFeeWallet(): PublicKey | null {
  const trimmed = FEE_WALLET_STR.trim();
  if (FEE_WALLET_PLACEHOLDERS.has(trimmed)) {
    return null;
  }
  /** If deploy mistakenly sets fee wallet to the documented ops/dev address, send fees to treasury instead. */
  const devStr = ECOSYSTEM_SOLSCAN_DEVELOPER.trim();
  const treasuryStr = ECOSYSTEM_SOLSCAN_TREASURY.trim();
  const useStr =
    treasuryStr.length > 0 && trimmed === devStr ? treasuryStr : trimmed;
  try {
    return new PublicKey(useStr);
  } catch {
    return null;
  }
}

export function isFeeWalletConfigured(): boolean {
  return getFeeWallet() !== null;
}

export function feeTransferIx(
  payer: PublicKey,
  amountSol: number,
): TransactionInstruction | null {
  const ixs = platformFeeTransferInstructions(payer, amountSol, null);
  return ixs[0] ?? null;
}

/**
 * SOL **RootRecord platform fee** only (create, tools, Raydium tool fees, bulk fees).
 * When an eligible referrer is set, `REFERRAL_FEE_SHARE_BPS` of the gross fee goes to
 * the referrer and the remainder to the fee wallet. Payer debits the full `amountSol`
 * (rounding: referrer gets floor bps, fee wallet gets the rest).
 */
export function platformFeeTransferInstructions(
  payer: PublicKey,
  amountSol: number,
  referrer: string | null | undefined,
): TransactionInstruction[] {
  const fw = getFeeWallet();
  if (!fw) return [];
  const totalLamports = Math.round(amountSol * LAMPORTS_PER_SOL);
  if (totalLamports <= 0) return [];

  const refB58 = eligibleReferrerForPayer(referrer, payer);
  if (!refB58 || REFERRAL_FEE_SHARE_BPS <= 0) {
    return [
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: fw,
        lamports: totalLamports,
      }),
    ];
  }

  const refPk = new PublicKey(refB58);
  const refLamports = Math.floor(
    (totalLamports * REFERRAL_FEE_SHARE_BPS) / 10_000,
  );
  const platLamports = totalLamports - refLamports;
  const out: TransactionInstruction[] = [];
  if (platLamports > 0) {
    out.push(
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: fw,
        lamports: platLamports,
      }),
    );
  }
  if (refLamports > 0) {
    out.push(
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: refPk,
        lamports: refLamports,
      }),
    );
  }
  return out;
}

export function explorerUrl(
  signatureOrAddress: string,
  type: 'tx' | 'address' = 'tx',
): string {
  const cluster =
    SOLANA_NETWORK === 'mainnet-beta' ? '' : `?cluster=${SOLANA_NETWORK}`;
  return `https://solscan.io/${type}/${signatureOrAddress}${cluster}`;
}

export interface CreateTokenInput {
  name: string;
  symbol: string;
  decimals: number;
  supply: bigint;
  uri: string;
}

export interface CreateTokenResult {
  signature: string;
  mint: string;
  ata: string;
}

/**
 * Derive Metaplex metadata PDA for a given mint
 */
export function metadataPda(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    METADATA_PROGRAM_ID,
  );
  return pda;
}

/**
 * Build and send a single transaction:
 *  1. create mint account
 *  2. initialize mint
 *  3. create ATA for payer
 *  4. mint full supply
 *  5. create Metaplex metadata account v3
 *  6. transfer create fee: fee wallet + optional 10% referrer share (same tx)
 *  7. optional memo tagging referrer wallet (same tx, for analytics)
 */
export async function createSplToken(
  wallet: WalletContextState,
  input: CreateTokenInput,
  opts?: { referrer?: string | null },
): Promise<CreateTokenResult> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error('Wallet not connected');
  }
  const connection = getConnection();
  const payer = wallet.publicKey;

  const mintKeypair = Keypair.generate();
  const mint = mintKeypair.publicKey;

  const lamportsForMint = await getMinimumBalanceForRentExemptMint(connection);

  const ata = await getAssociatedTokenAddress(mint, payer);

  const metadata = metadataPda(mint);

  const tx = new Transaction();

  // 1. create mint account
  tx.add(
    SystemProgram.createAccount({
      fromPubkey: payer,
      newAccountPubkey: mint,
      space: MINT_SIZE,
      lamports: lamportsForMint,
      programId: TOKEN_PROGRAM_ID,
    }),
  );

  // 2. initialize mint
  tx.add(
    createInitializeMint2Instruction(
      mint,
      input.decimals,
      payer, // mint authority
      payer, // freeze authority
      TOKEN_PROGRAM_ID,
    ),
  );

  // 3. create ATA
  tx.add(createAssociatedTokenAccountInstruction(payer, ata, payer, mint));

  // 4. mint full supply (supply * 10^decimals)
  const fullSupply =
    input.supply * BigInt(10) ** BigInt(input.decimals);
  tx.add(createMintToInstruction(mint, ata, payer, fullSupply));

  // 5. metaplex metadata
  tx.add(
    createCreateMetadataAccountV3Instruction(
      {
        metadata,
        mint,
        mintAuthority: payer,
        payer,
        updateAuthority: payer,
      },
      {
        createMetadataAccountArgsV3: {
          data: {
            name: input.name.slice(0, 32),
            symbol: input.symbol.slice(0, 10),
            uri: input.uri.slice(0, 200),
            sellerFeeBasisPoints: 0,
            creators: null,
            collection: null,
            uses: null,
          },
          isMutable: true,
          collectionDetails: null,
        },
      },
    ),
  );

  // 6. fee transfers (platform + optional referrer split)
  const feeIxs = platformFeeTransferInstructions(
    payer,
    CREATE_FEE_SOL,
    opts?.referrer ?? null,
  );
  for (const ix of feeIxs) tx.add(ix);
  appendReferralMemoToTransaction(tx, payer, opts?.referrer ?? null);

  // Fee ix runs last; if the wallet is light on SOL, rent consumes balance first and the
  // transfer fails with "insufficient lamports ... need 25000000". Preflight a lower bound.
  const METADATA_ACCOUNT_SPACE = 679;
  const lamportsMetadata = await connection.getMinimumBalanceForRentExemption(
    METADATA_ACCOUNT_SPACE,
  );
  const lamportsAta = await connection.getMinimumBalanceForRentExemption(165);
  const feeLamports = feeIxs.length
    ? Math.round(CREATE_FEE_SOL * LAMPORTS_PER_SOL)
    : 0;
  const headroom = 25_000;
  const minLamportsNeeded =
    lamportsForMint + lamportsMetadata + lamportsAta + feeLamports + headroom;
  const balance = await connection.getBalance(payer, 'confirmed');
  if (balance < minLamportsNeeded) {
    throw new Error(
      `Not enough SOL: this create needs about ${(minLamportsNeeded / LAMPORTS_PER_SOL).toFixed(3)} SOL (mint + metadata + token account rent${feeLamports > 0 ? ` + ${CREATE_FEE_SOL} SOL platform fee` : ''}). You have ${(balance / LAMPORTS_PER_SOL).toFixed(3)} SOL — fund the wallet and retry.`,
    );
  }

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer;
  tx.partialSign(mintKeypair);

  const signed = await wallet.signTransaction(tx);
  const signature = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
    maxRetries: 5,
  });
  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    'confirmed',
  );

  return { signature, mint: mint.toBase58(), ata: ata.toBase58() };
}

/**
 * Resolve SPL vs Token-2022 program for a mint, and ensure the pubkey is a real mint
 * (not a wallet, ATA, or other account — those used to fall through to legacy SPL and
 * caused "IncorrectProgramId" in simulations).
 */
async function detectMintProgram(mint: PublicKey): Promise<PublicKey> {
  const connection = getConnection();
  const info = await connection.getAccountInfo(mint, 'confirmed');
  if (!info) throw new Error('Mint not found');
  if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) {
    try {
      await getMint(connection, mint, 'confirmed', TOKEN_2022_PROGRAM_ID);
      return TOKEN_2022_PROGRAM_ID;
    } catch {
      throw new Error('Not a valid Token-2022 mint account.');
    }
  }
  if (info.owner.equals(TOKEN_PROGRAM_ID)) {
    try {
      await getMint(connection, mint, 'confirmed', TOKEN_PROGRAM_ID);
      return TOKEN_PROGRAM_ID;
    } catch {
      throw new Error(
        'Not a valid SPL mint — paste the mint address from Solscan (or your launch success screen), not your wallet or token account.',
      );
    }
  }
  throw new Error(
    'That address is not an SPL or Token-2022 mint. Use the mint field from the token page on Solscan.',
  );
}

/** Parse base58 and ensure the account is a real SPL or Token-2022 mint. */
export async function resolveMintAndProgram(
  mintAddress: string,
): Promise<{ mint: PublicKey; programId: PublicKey }> {
  let mint: PublicKey;
  try {
    mint = new PublicKey(mintAddress.trim());
  } catch {
    throw new Error('Invalid mint address — must be valid base58.');
  }
  const programId = await detectMintProgram(mint);
  return { mint, programId };
}

/** One legacy `Transaction`: sign, send, confirm (used for simple fee / memo flows). */
export async function sendSimpleTx(
  wallet: WalletContextState,
  ixs: TransactionInstruction[],
): Promise<string> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error('Wallet not connected');
  }
  const connection = getConnection();
  const tx = new Transaction().add(...ixs);
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = wallet.publicKey;

  const signed = await wallet.signTransaction(tx);
  const signature = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
    maxRetries: 5,
  });
  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    'confirmed',
  );
  await assertSignatureNoProgramError(connection, signature);
  return signature;
}

/**
 * After `sendTransaction`, wait for RPC confirmation and throw if the cluster
 * reports an on-chain error. Raydium SDK V0 + wallet often skips this step.
 */
export async function confirmSignatureSucceeded(
  signature: string,
  commitment: 'confirmed' | 'finalized' = 'confirmed',
): Promise<void> {
  const connection = getConnection();
  await connection.confirmTransaction(signature, commitment);
  await assertSignatureNoProgramError(connection, signature);
}

async function assertSignatureNoProgramError(
  connection: Connection,
  signature: string,
): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const { value } = await connection.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    });
    const st = value[0];
    if (st?.err) {
      throw new Error(
        `Transaction failed on-chain: ${JSON.stringify(st.err)} — signature ${signature}`,
      );
    }
    if (st) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(
    `Could not verify transaction status for signature ${signature}`,
  );
}

export async function revokeMintAuthority(
  wallet: WalletContextState,
  mintAddress: string,
  referrerWallet?: string | null,
): Promise<string> {
  if (!wallet.publicKey) throw new Error('Wallet not connected');
  const { mint, programId } = await resolveMintAndProgram(mintAddress);
  const ixs: TransactionInstruction[] = [
    createSetAuthorityInstruction(
      mint,
      wallet.publicKey,
      AuthorityType.MintTokens,
      null,
      [],
      programId,
    ),
  ];
  ixs.push(
    ...platformFeeTransferInstructions(
      wallet.publicKey,
      ACTION_FEE_SOL,
      referrerWallet,
    ),
  );
  appendReferralMemoIfEligible(ixs, wallet.publicKey, referrerWallet);
  return sendSimpleTx(wallet, ixs);
}

export async function revokeFreezeAuthority(
  wallet: WalletContextState,
  mintAddress: string,
  referrerWallet?: string | null,
): Promise<string> {
  if (!wallet.publicKey) throw new Error('Wallet not connected');
  const { mint, programId } = await resolveMintAndProgram(mintAddress);
  const ixs: TransactionInstruction[] = [
    createSetAuthorityInstruction(
      mint,
      wallet.publicKey,
      AuthorityType.FreezeAccount,
      null,
      [],
      programId,
    ),
  ];
  ixs.push(
    ...platformFeeTransferInstructions(
      wallet.publicKey,
      ACTION_FEE_SOL,
      referrerWallet,
    ),
  );
  appendReferralMemoIfEligible(ixs, wallet.publicKey, referrerWallet);
  return sendSimpleTx(wallet, ixs);
}

export type FreezeThawBulkMode = 'freeze' | 'thaw';

export type FreezeThawBulkSkip = { owner: string; reason: string };

/**
 * Freeze or thaw SPL token accounts for `mint`.
 * Each line may be either (1) a **holder wallet** pubkey → we use that wallet’s ATA for `mint`, or
 * (2) a **token account** pubkey that already holds `mint` → we freeze/thaw that account directly.
 * RootRecord fee (`FREEZE_THAW_FEE_PER_ADDRESS_SOL` per applied account) is bundled in the same
 * transaction as each batch’s freeze/thaw instructions. Batches across multiple signatures when needed.
 */
export async function bulkFreezeOrThawWalletAtas(
  wallet: WalletContextState,
  mintAddress: string,
  lineStrings: string[],
  mode: FreezeThawBulkMode,
  referrerWallet?: string | null,
): Promise<{ signatures: string[]; skipped: FreezeThawBulkSkip[]; applied: number }> {
  if (!wallet.publicKey) throw new Error('Wallet not connected');
  const connection = getConnection();
  const trimmedMint = mintAddress.trim();
  if (trimmedMint.length < 32) {
    throw new Error(
      'Mint address looks incomplete — paste the full base58 mint (usually 43–44 characters).',
    );
  }
  const { mint, programId } = await resolveMintAndProgram(trimmedMint);
  const mintInfo = await getMint(connection, mint, 'confirmed', programId);
  if (mintInfo.freezeAuthority === null) {
    throw new Error('This mint has no freeze authority — accounts cannot be frozen or thawed.');
  }
  if (!mintInfo.freezeAuthority.equals(wallet.publicKey)) {
    throw new Error('Connect the wallet that is the freeze authority for this mint.');
  }

  const lineSet = new Set<string>();
  const lines: string[] = [];
  for (const raw of lineStrings) {
    const s = raw.trim();
    if (!s) continue;
    if (lineSet.has(s)) continue;
    lineSet.add(s);
    lines.push(s);
  }

  const skipped: FreezeThawBulkSkip[] = [];
  const ixs: TransactionInstruction[] = [];

  for (const s of lines) {
    let pk: PublicKey;
    try {
      pk = new PublicKey(s);
    } catch {
      skipped.push({ owner: s, reason: 'Invalid pubkey' });
      continue;
    }

    let ata: PublicKey;
    let acc: Awaited<ReturnType<typeof getAccount>>;
    try {
      const direct = await getAccount(connection, pk, 'confirmed', programId);
      if (!direct.mint.equals(mint)) {
        skipped.push({
          owner: s,
          reason: 'This address is a token account for a different mint — paste holder wallet or correct token account',
        });
        continue;
      }
      ata = pk;
      acc = direct;
    } catch {
      ata = await getAssociatedTokenAddress(mint, pk, false, programId);
      try {
        acc = await getAccount(connection, ata, 'confirmed', programId);
      } catch {
        skipped.push({
          owner: s,
          reason: 'Not a token account for this mint and no ATA for this wallet',
        });
        continue;
      }
      if (!acc.mint.equals(mint)) {
        skipped.push({ owner: s, reason: 'ATA mint mismatch' });
        continue;
      }
    }

    if (mode === 'freeze') {
      if (acc.isFrozen) {
        skipped.push({ owner: s, reason: 'Already frozen' });
        continue;
      }
      ixs.push(
        createFreezeAccountInstruction(ata, mint, wallet.publicKey, [], programId),
      );
    } else {
      if (!acc.isFrozen) {
        skipped.push({ owner: s, reason: 'Not frozen' });
        continue;
      }
      ixs.push(
        createThawAccountInstruction(ata, mint, wallet.publicKey, [], programId),
      );
    }
  }

  if (ixs.length === 0) {
    const hint =
      skipped.length > 0
        ? ` Nothing to sign (${skipped.length} skipped). First skip: ${skipped[0]?.reason ?? ''}.`
        : '';
    throw new Error(`No accounts to ${mode}.${hint}`);
  }

  const signatures: string[] = [];
  for (let i = 0; i < ixs.length; i += FREEZE_THAW_BULK_IX_PER_TX) {
    const chunk = ixs.slice(i, i + FREEZE_THAW_BULK_IX_PER_TX);
    const batchFeeSol = FREEZE_THAW_FEE_PER_ADDRESS_SOL * chunk.length;
    const batch: TransactionInstruction[] = [
      ...chunk,
      ...platformFeeTransferInstructions(
        wallet.publicKey,
        batchFeeSol,
        referrerWallet,
      ),
    ];
    if (i === 0) {
      appendReferralMemoIfEligible(batch, wallet.publicKey, referrerWallet);
    }
    signatures.push(await sendSimpleTx(wallet, batch));
  }

  return { signatures, skipped, applied: ixs.length };
}

export async function mintMore(
  wallet: WalletContextState,
  mintAddress: string,
  amount: bigint,
  decimals: number,
  referrerWallet?: string | null,
): Promise<string> {
  if (!wallet.publicKey) throw new Error('Wallet not connected');
  const { mint, programId } = await resolveMintAndProgram(mintAddress);
  const ata = await getAssociatedTokenAddress(
    mint,
    wallet.publicKey,
    false,
    programId,
  );
  const fullAmount = amount * BigInt(10) ** BigInt(decimals);

  const connection = getConnection();
  const ataInfo = await connection.getAccountInfo(ata);
  const ixs: TransactionInstruction[] = [];
  if (!ataInfo) {
    ixs.push(
      createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        ata,
        wallet.publicKey,
        mint,
        programId,
      ),
    );
  }
  ixs.push(
    createMintToInstruction(
      mint,
      ata,
      wallet.publicKey,
      fullAmount,
      [],
      programId,
    ),
  );
  ixs.push(
    ...platformFeeTransferInstructions(
      wallet.publicKey,
      ACTION_FEE_SOL,
      referrerWallet,
    ),
  );
  appendReferralMemoIfEligible(ixs, wallet.publicKey, referrerWallet);
  return sendSimpleTx(wallet, ixs);
}

/**
 * Burn tokens from the connected wallet's ATA for this mint (legacy SPL or Token-2022).
 * No platform fee — user only pays Solana network fees.
 *
 * @param rawBurnAmount Amount in smallest on-chain units (same as wallet “raw” balance).
 */
export async function burnTokens(
  wallet: WalletContextState,
  mintAddress: string,
  rawBurnAmount: bigint,
): Promise<string> {
  if (!wallet.publicKey) throw new Error('Wallet not connected');
  const { mint, programId } = await resolveMintAndProgram(mintAddress);
  const connection = getConnection();
  const mintInfo = await getMint(connection, mint, 'confirmed', programId);
  const decimals = mintInfo.decimals;
  const ata = await getAssociatedTokenAddress(
    mint,
    wallet.publicKey,
    false,
    programId,
  );
  const acc = await getAccount(connection, ata, 'confirmed', programId);
  if (rawBurnAmount <= 0n) {
    throw new Error('Amount must be greater than zero');
  }
  if (rawBurnAmount > acc.amount) {
    throw new Error(
      `This wallet only holds ${acc.amount.toString()} raw units in its token account for that mint; cannot burn ${rawBurnAmount.toString()}.`,
    );
  }
  const ix = createBurnCheckedInstruction(
    ata,
    mint,
    wallet.publicKey,
    rawBurnAmount,
    decimals,
    [],
    programId,
  );
  return sendSimpleTx(wallet, [ix]);
}

export interface UpdateMetadataInput {
  name: string;
  symbol: string;
  uri: string;
}

export async function updateTokenMetadata(
  wallet: WalletContextState,
  mintAddress: string,
  data: UpdateMetadataInput,
  referrerWallet?: string | null,
): Promise<string> {
  if (!wallet.publicKey) throw new Error('Wallet not connected');
  const { mint, programId } = await resolveMintAndProgram(mintAddress);
  if (programId.equals(TOKEN_2022_PROGRAM_ID)) {
    throw new Error(
      'Update metadata (legacy) only applies to standard SPL mints with Metaplex metadata. Token-2022 mints use the on-mint TokenMetadata extension.',
    );
  }
  const connection = getConnection();
  const metadata = metadataPda(mint);
  const existing = await MetaplexMetadata.fromAccountAddress(
    connection,
    metadata,
    'confirmed',
  );
  if (!existing.isMutable) {
    throw new Error('Listing metadata is locked — on-chain listing details cannot be changed anymore.');
  }
  const d = existing.data;
  const ix = createUpdateMetadataAccountV2Instruction(
    {
      metadata,
      updateAuthority: wallet.publicKey,
    },
    {
      updateMetadataAccountArgsV2: {
        data: {
          name: data.name.slice(0, 32),
          symbol: data.symbol.slice(0, 10),
          uri: data.uri.slice(0, 200),
          sellerFeeBasisPoints: d.sellerFeeBasisPoints,
          creators: d.creators,
          collection: existing.collection,
          uses: existing.uses,
        },
        updateAuthority: wallet.publicKey,
        primarySaleHappened: null,
        isMutable: null,
      },
    },
  );
  const ixs: TransactionInstruction[] = [ix];
  ixs.push(
    ...platformFeeTransferInstructions(
      wallet.publicKey,
      ACTION_FEE_SOL,
      referrerWallet,
    ),
  );
  appendReferralMemoIfEligible(ixs, wallet.publicKey, referrerWallet);
  return sendSimpleTx(wallet, ixs);
}

/**
 * Set Metaplex metadata `isMutable` to false so name, symbol, and URI can no longer be updated.
 * The connected wallet must be the metadata update authority. Legacy SPL + Metaplex only.
 */
export async function lockLegacyListingMetadata(
  wallet: WalletContextState,
  mintAddress: string,
  referrerWallet?: string | null,
): Promise<string> {
  if (!wallet.publicKey) throw new Error('Wallet not connected');
  const { mint, programId } = await resolveMintAndProgram(mintAddress);
  if (programId.equals(TOKEN_2022_PROGRAM_ID)) {
    throw new Error(
      'This tool only applies to standard SPL tokens with Metaplex listing metadata. Token-2022 uses different metadata rules.',
    );
  }
  const connection = getConnection();
  const metadata = metadataPda(mint);
  let existing: MetaplexMetadata;
  try {
    existing = await MetaplexMetadata.fromAccountAddress(connection, metadata, 'confirmed');
  } catch {
    throw new Error('No listing metadata account found for this mint.');
  }
  if (!existing.isMutable) {
    throw new Error('Listing metadata is already locked — listing details can no longer be edited.');
  }
  const ua = existing.updateAuthority;
  if (ua.equals(PublicKey.default)) {
    throw new Error(
      'This mint has no listing update authority on record, so listing details cannot be changed from here.',
    );
  }
  if (!ua.equals(wallet.publicKey)) {
    throw new Error(
      'Connect the wallet that is the listing metadata update authority (the same wallet that can edit listing details).',
    );
  }
  const ix = createUpdateMetadataAccountV2Instruction(
    {
      metadata,
      updateAuthority: wallet.publicKey,
    },
    {
      updateMetadataAccountArgsV2: {
        data: null,
        updateAuthority: null,
        primarySaleHappened: null,
        isMutable: false,
      },
    },
  );
  const ixs: TransactionInstruction[] = [ix];
  ixs.push(
    ...platformFeeTransferInstructions(
      wallet.publicKey,
      ACTION_FEE_SOL,
      referrerWallet,
    ),
  );
  appendReferralMemoIfEligible(ixs, wallet.publicKey, referrerWallet);
  return sendSimpleTx(wallet, ixs);
}
