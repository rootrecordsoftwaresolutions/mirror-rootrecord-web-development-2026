import type { D1Database } from "@cloudflare/workers-types";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import bs58 from "bs58";
import nacl from "tweetnacl";

import { json } from "./cors";
import { verifyWorkerOpsAdmin } from "./push";
import { sessionFromBearer, type AuthEnv } from "./primary-auth";
import { notifySolanaToolsDiscord } from "./discord-solana-notify";
import { insertTreasuryToCustodialLedger } from "./earn-rewards-ledger";
import {
  CUSTODIAL_SOL_RESERVE_LAMPORTS,
  custodialSolSpendWouldViolateReserve,
  estimateFeeIfCustodialPays,
  sumLamportsTransferredFromCustodian,
  tryDecompileCustodialSignInstructions,
} from "./custodial-sol-reserve";

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

async function importAesKeyFromEnv(env: { INTERNAL_WALLET_ENC_KEY_B64?: string }): Promise<CryptoKey | null> {
  const b64 = String(env.INTERNAL_WALLET_ENC_KEY_B64 || "").trim();
  if (!b64) return null;
  const raw = base64ToBytes(b64);
  if (raw.length !== 32) return null;
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function aesGcmEncrypt(key: CryptoKey, plaintext: Uint8Array): Promise<{ iv: Uint8Array; ct: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ctBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return { iv, ct: new Uint8Array(ctBuf) };
}

async function aesGcmDecrypt(key: CryptoKey, iv: Uint8Array, ct: Uint8Array): Promise<Uint8Array> {
  const ptBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new Uint8Array(ptBuf);
}

/** D1 may return BLOB as Uint8Array, ArrayBuffer, number[], or (if stored as text) base64. */
function d1BlobToUint8(v: unknown): Uint8Array | null {
  if (v == null) return null;
  if (v instanceof Uint8Array) return v.byteLength ? v : null;
  if (v instanceof ArrayBuffer) {
    const u = new Uint8Array(v);
    return u.byteLength ? u : null;
  }
  if (Array.isArray(v)) {
    const u = new Uint8Array(v as number[]);
    return u.byteLength ? u : null;
  }
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    try {
      const u = base64ToBytes(s);
      return u.byteLength ? u : null;
    } catch {
      return null;
    }
  }
  return null;
}

export type InternalWalletEnv = AuthEnv & {
  DB: D1Database;
  INTERNAL_WALLET_ENC_KEY_B64?: string;
  DISCORD_WEBHOOK_SOLANA_TOOLS?: string;
  /** Mainnet RPC for custodial sign reserve checks (optional; defaults in handler). */
  SOLANA_RPC_URL?: string;
  /** Treasury key for SOL top-ups and RRTT cron (same secret as RRTT cron). */
  RRTT_TREASURY_SECRET_KEY_B58?: string;
};

async function readWalletRow(
  db: D1Database,
  accountId: string,
): Promise<{ pubkey: string; created_at: string; enc: Uint8Array; iv: Uint8Array } | null> {
  const row = await db
    .prepare(
      "SELECT pubkey, created_at, privkey_pkcs8_enc AS enc_raw, privkey_iv AS iv_raw FROM internal_solana_wallets WHERE account_id = ?",
    )
    .bind(accountId)
    .first<{ pubkey: string; created_at: string; enc_raw: unknown; iv_raw: unknown }>();
  if (!row?.pubkey) return null;
  const enc = d1BlobToUint8(row.enc_raw);
  const iv = d1BlobToUint8(row.iv_raw);
  if (!enc || !iv) return null;
  return {
    pubkey: String(row.pubkey).trim(),
    created_at: String(row.created_at || ""),
    enc,
    iv,
  };
}

async function custodialPubkeyOnly(db: D1Database, accountId: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT pubkey FROM internal_solana_wallets WHERE account_id = ?")
    .bind(accountId)
    .first<{ pubkey: string }>();
  const p = String(row?.pubkey || "").trim();
  return p || null;
}

/** Decrypt custodial key for signing (treasury sweeps, custodial sign endpoints). */
export async function loadKeypairForAccount(env: InternalWalletEnv, accountId: string): Promise<Keypair | null> {
  const row = await readWalletRow(env.DB, accountId);
  if (!row) return null;
  const aesKey = await importAesKeyFromEnv(env);
  if (!aesKey) return null;
  try {
    const sk = await aesGcmDecrypt(aesKey, row.iv, row.enc);
    if (sk.length === 64) return Keypair.fromSecretKey(sk);
    if (sk.length === 32) return Keypair.fromSeed(sk);
  } catch {
    return null;
  }
  return null;
}

export type ProvisionCustodialOptions = { suppressDiscord?: boolean };

/** Create custodial keypair if missing; safe to call on signup (no-op if disabled or exists). */
export async function provisionCustodialWalletIfMissing(
  env: InternalWalletEnv,
  accountId: string,
  opts?: ProvisionCustodialOptions,
): Promise<{ created: boolean }> {
  const suppressDiscord = Boolean(opts?.suppressDiscord);
  const aesKey = await importAesKeyFromEnv(env);
  if (!aesKey) return { created: false };
  const aid = String(accountId || "").trim();
  if (!aid) return { created: false };

  const existing = await readWalletRow(env.DB, aid);
  if (existing) return { created: false };

  const pubkeyOrphan = await custodialPubkeyOnly(env.DB, aid);
  if (pubkeyOrphan) {
    console.error("provisionCustodialWalletIfMissing: unreadable wallet row", aid);
    return { created: false };
  }

  const kp = Keypair.generate();
  const enc = await aesGcmEncrypt(aesKey, kp.secretKey);
    try {
      await env.DB
        .prepare(
          "INSERT INTO internal_solana_wallets (account_id, pubkey, privkey_pkcs8_enc, privkey_iv) VALUES (?, ?, ?, ?)",
        )
        .bind(aid, kp.publicKey.toBase58(), enc.ct, enc.iv)
        .run();
      try {
        await env.DB
          .prepare("INSERT OR IGNORE INTO rr_earn_custodial_state (account_id) VALUES (?)")
          .bind(aid)
          .run();
      } catch {
        /* rr_earn_custodial_state until migration 0027 */
      }
      await tryFundCustodialMinimumSolAfterCreate(env, kp.publicKey.toBase58());
      if (!suppressDiscord) {
      const msg =
        `**Solana tools — custodial wallet (signup auto)**\n` +
        `**Account:** \`${aid}\`\n` +
        `**Pubkey:** \`${kp.publicKey.toBase58()}\`\n`;
      await notifySolanaToolsDiscord(env.DISCORD_WEBHOOK_SOLANA_TOOLS, msg);
    }
    return { created: true };
  } catch (e) {
    const msg = String(e && typeof e === "object" && "message" in e ? (e as Error).message : e);
    console.error("provisionCustodialWalletIfMissing", aid, msg);
    return { created: false };
  }
}

/** Operator-only: provision custodial wallets for accounts missing `internal_solana_wallets` rows. */
export async function backfillCustodialWalletsMissingAccounts(
  env: InternalWalletEnv,
  batchLimit: number,
): Promise<{
  examined: number;
  provisioned: number;
  encryption_off: boolean;
  remaining_without_wallet: number;
}> {
  const aesKey = await importAesKeyFromEnv(env);
  if (!aesKey) {
    return { examined: 0, provisioned: 0, encryption_off: true, remaining_without_wallet: 0 };
  }
  const lim = Math.min(500, Math.max(1, Math.floor(batchLimit || 300)));
  const rows = await env.DB
    .prepare(
      `SELECT la.id AS account_id
       FROM license_accounts la
       LEFT JOIN internal_solana_wallets iw ON iw.account_id = la.id
       WHERE iw.account_id IS NULL
       LIMIT ?`,
    )
    .bind(lim)
    .all<{ account_id: string }>();
  const ids = (rows.results || []).map((r) => String(r.account_id || "").trim()).filter(Boolean);
  let provisioned = 0;
  for (const id of ids) {
    const r = await provisionCustodialWalletIfMissing(env, id, { suppressDiscord: true });
    if (r.created) provisioned += 1;
  }
  const cnt = await env.DB
    .prepare(
      `SELECT COUNT(*) AS c
       FROM license_accounts la
       LEFT JOIN internal_solana_wallets iw ON iw.account_id = la.id
       WHERE iw.account_id IS NULL`,
    )
    .first<{ c: number }>();
  const remaining = Math.max(0, Math.floor(Number(cnt?.c) || 0));
  await notifySolanaToolsDiscord(
    env.DISCORD_WEBHOOK_SOLANA_TOOLS,
    `**Solana tools — custodial bulk backfill (batch)**\n` +
      `Examined (this batch): ${ids.length}\n` +
      `Provisioned (this batch): ${provisioned}\n` +
      `Accounts still without wallet: ${remaining}\n`,
  );
  return {
    examined: ids.length,
    provisioned,
    encryption_off: false,
    remaining_without_wallet: remaining,
  };
}

export type CustodialBackfillEnv = InternalWalletEnv & { RR_PUSH_ADMIN_SECRET?: string };

/** POST `/api/internal/provision-custodial-wallets-missing` — `X-RR-Push-Admin-Key` must match Worker secret. */
export async function handleCustodialInternalBackfillRoute(
  request: Request,
  env: CustodialBackfillEnv,
  sub: string,
  method: string,
): Promise<Response | null> {
  if (method !== "POST" || sub !== "/internal/provision-custodial-wallets-missing") return null;
  const secret = (env.RR_PUSH_ADMIN_SECRET || "").trim();
  if (!secret) {
    return json({ ok: false, detail: "RR_PUSH_ADMIN_SECRET is not set on this Worker." }, 503);
  }
  const adminOk = await verifyWorkerOpsAdmin(request, env);
  if (!adminOk) {
    const has = Boolean(request.headers.get("X-RR-Push-Admin-Key"));
    return json({ ok: false, detail: has ? "Invalid admin key." : "Missing X-RR-Push-Admin-Key header." }, 401);
  }
  let batchLimit = 300;
  try {
    const body = (await request.json().catch(() => ({}))) as { limit?: number };
    if (typeof body.limit === "number" && Number.isFinite(body.limit)) {
      batchLimit = Math.min(500, Math.max(1, Math.floor(body.limit)));
    }
  } catch {
    /* empty body */
  }
  const r = await backfillCustodialWalletsMissingAccounts(env, batchLimit);
  if (r.encryption_off) {
    return json({ ok: false, detail: "INTERNAL_WALLET_ENC_KEY_B64 is not configured on this Worker." }, 503);
  }
  return json(
    {
      ok: true,
      examined: r.examined,
      provisioned: r.provisioned,
      remaining_without_wallet: r.remaining_without_wallet,
      more_batches_suggested: r.remaining_without_wallet > 0,
    },
    200,
  );
}

function custodialEnabled(env: InternalWalletEnv): boolean {
  return Boolean(String(env.INTERNAL_WALLET_ENC_KEY_B64 || "").trim());
}

/** GET/POST `/v1/me/custodial-sol-wallet` and POST `.../sign`, `.../sign-message` — matches solana-rootrecord-site Next app `custodialWalletAdapter` / `fetchCustodialInfo`. */
export async function handleCustodialSolWalletV1(
  request: Request,
  env: InternalWalletEnv,
  method: string,
  pathname: string,
): Promise<Response> {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return json({ detail: "Sign in required.", ok: false }, 401);
  }
  const token = auth.slice(7).trim();
  const sess = await sessionFromBearer(env, token);
  if (!sess) return json({ detail: "Invalid or expired session.", ok: false }, 401);

  const basePath = "/v1/me/custodial-sol-wallet";
  const rest = pathname === basePath ? "" : pathname.slice(basePath.length);

  if (method === "GET" && rest === "") {
    const row = await readWalletRow(env.DB, sess.accountId);
    const pkOnly = row?.pubkey ?? (await custodialPubkeyOnly(env.DB, sess.accountId));
    return json(
      {
        ok: true,
        has_wallet: Boolean(pkOnly),
        public_key: pkOnly ?? null,
        custodial_enabled: custodialEnabled(env),
      },
      200,
    );
  }

  if (method === "POST" && rest === "") {
    const existing = await readWalletRow(env.DB, sess.accountId);
    if (existing?.pubkey) {
      return json(
        {
          ok: true,
          created: false,
          has_wallet: true,
          public_key: existing.pubkey,
          created_at: existing.created_at,
          custodial_enabled: custodialEnabled(env),
        },
        200,
      );
    }
    const pubkeyOrphan = await custodialPubkeyOnly(env.DB, sess.accountId);
    if (pubkeyOrphan) {
      console.error("custodial wallet: row without readable ciphertext", sess.accountId);
      return json(
        {
          ok: false,
          detail:
            "A custodial wallet row exists but keys could not be read (encryption key mismatch or damaged data). Contact support; do not retry until fixed.",
          custodial_enabled: custodialEnabled(env),
        },
        503,
      );
    }
    const aesKey = await importAesKeyFromEnv(env);
    if (!aesKey) {
      console.error("custodial wallet: INTERNAL_WALLET_ENC_KEY_B64 missing or invalid length (need 32-byte key base64)");
      return json(
        {
          ok: false,
          detail:
            "Custodial wallet creation is not available on this deployment yet (server wallet encryption is not enabled). Contact support if this continues.",
          custodial_enabled: false,
        },
        503,
      );
    }
    const kp = Keypair.generate();
    const enc = await aesGcmEncrypt(aesKey, kp.secretKey);
    try {
      await env.DB
        .prepare(
          "INSERT INTO internal_solana_wallets (account_id, pubkey, privkey_pkcs8_enc, privkey_iv) VALUES (?, ?, ?, ?)",
        )
        .bind(sess.accountId, kp.publicKey.toBase58(), enc.ct, enc.iv)
        .run();
      try {
        await env.DB
          .prepare("INSERT OR IGNORE INTO rr_earn_custodial_state (account_id) VALUES (?)")
          .bind(sess.accountId)
          .run();
      } catch {
        /* migration 0027 */
      }
      await tryFundCustodialMinimumSolAfterCreate(env, kp.publicKey.toBase58());
    } catch (e) {
      const msg = String(e && typeof e === "object" && "message" in e ? (e as Error).message : e);
      console.error("custodial wallet create", sess.accountId, msg);
      const again = await custodialPubkeyOnly(env.DB, sess.accountId);
      if (again) {
        const recovered = await readWalletRow(env.DB, sess.accountId);
        if (recovered) {
          return json(
            {
              ok: true,
              created: false,
              has_wallet: true,
              public_key: recovered.pubkey,
              created_at: recovered.created_at,
              custodial_enabled: custodialEnabled(env),
            },
            200,
          );
        }
      }
      const detail = /no such table|no such column/i.test(msg)
        ? "Account database is missing custodial wallet tables or columns. Apply the latest D1 migrations for this Worker."
        : /UNIQUE constraint failed/i.test(msg)
          ? "A wallet record already exists for this account. Refresh the page or contact support."
          : "Could not create custodial wallet. Try again in a moment; if it keeps failing, contact support.";
      return json({ ok: false, detail }, 500);
    }
    const row = await readWalletRow(env.DB, sess.accountId);
    const createdAt = row?.created_at || new Date().toISOString();
    const msg =
      `**Solana tools — custodial wallet (manual generate)**\n` +
      `**Account:** \`${sess.accountId}\`\n` +
      `**Pubkey:** \`${kp.publicKey.toBase58()}\`\n` +
      `**Created:** ${createdAt}`;
    await notifySolanaToolsDiscord(env.DISCORD_WEBHOOK_SOLANA_TOOLS, msg);
    return json(
      {
        ok: true,
        created: true,
        has_wallet: true,
        public_key: kp.publicKey.toBase58(),
        created_at: createdAt,
        custodial_enabled: true,
      },
      201,
    );
  }

  if (method === "POST" && rest === "/sign") {
    let body: { transaction_b64?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return json({ detail: "Invalid JSON" }, 400);
    }
    const b64 = String(body.transaction_b64 || "").trim();
    if (!b64) return json({ detail: "transaction_b64 is required." }, 422);
    let raw: Uint8Array;
    try {
      raw = base64ToBytes(b64);
    } catch {
      return json({ detail: "Invalid transaction_b64." }, 422);
    }
    const kp = await loadKeypairForAccount(env, sess.accountId);
    if (!kp) return json({ detail: "No custodial wallet on file or cannot decrypt key." }, 403);

    const decompiled = tryDecompileCustodialSignInstructions(raw);
    if (!decompiled) {
      return json(
        {
          detail:
            "Could not read this transaction (unsupported encoding or address lookup tables). Try rebuilding the transaction or contact support.",
        },
        422,
      );
    }
    const solOut = sumLamportsTransferredFromCustodian(decompiled, kp.publicKey);
    const feeIfPayer = estimateFeeIfCustodialPays(raw, kp.publicKey);
    const totalSolDebit = solOut + feeIfPayer;
    if (totalSolDebit > 0n) {
      const rpcUrl = String(env.SOLANA_RPC_URL || "").trim() || "https://api.mainnet-beta.solana.com";
      const connection = new Connection(rpcUrl, "confirmed");
      const bal = await connection.getBalance(kp.publicKey, "confirmed").catch(() => 0);
      if (custodialSolSpendWouldViolateReserve(bal, totalSolDebit)) {
        const minSol = (CUSTODIAL_SOL_RESERVE_LAMPORTS / 1e9).toFixed(3);
        return json(
          {
            detail: `This transaction would spend too much SOL from your custodial wallet. At least ${minSol} SOL must stay for network fees (plus a small buffer). Reduce the SOL transfer or remove it.`,
          },
          400,
        );
      }
    }

    try {
      let signed: Transaction | VersionedTransaction;
      try {
        const vt = VersionedTransaction.deserialize(raw);
        vt.sign([kp]);
        signed = vt;
      } catch {
        const lt = Transaction.from(raw);
        lt.partialSign(kp);
        signed = lt;
      }
      const out = signed instanceof VersionedTransaction ? signed.serialize() : signed.serialize({ requireAllSignatures: false });
      return json({ signed_transaction_b64: bytesToBase64(new Uint8Array(out)) }, 200);
    } catch (e) {
      const msg = String(e && typeof e === "object" && "message" in e ? (e as Error).message : e);
      console.error("custodial sign tx", msg);
      return json({ detail: "Could not sign transaction." }, 500);
    }
  }

  if (method === "POST" && rest === "/sign-message") {
    let body: { message_b64?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return json({ detail: "Invalid JSON" }, 400);
    }
    const mb64 = String(body.message_b64 || "").trim();
    if (!mb64) return json({ detail: "message_b64 is required." }, 422);
    let message: Uint8Array;
    try {
      message = base64ToBytes(mb64);
    } catch {
      return json({ detail: "Invalid message_b64." }, 422);
    }
    const kp = await loadKeypairForAccount(env, sess.accountId);
    if (!kp) return json({ detail: "No custodial wallet on file or cannot decrypt key." }, 403);
    try {
      const sig = nacl.sign.detached(message, kp.secretKey);
      return json({ signature_b64: bytesToBase64(sig) }, 200);
    } catch (e) {
      const msg = String(e && typeof e === "object" && "message" in e ? (e as Error).message : e);
      console.error("custodial sign message", msg);
      return json({ detail: "Could not sign message." }, 500);
    }
  }

  return json({ detail: "Not found", ok: false }, 404);
}

/** POST body `{ withdraw_dest_pubkey: string | null }` — optional self-custody destination when no linked wallet. */
export async function handleCustodialWithdrawDestV1(request: Request, env: InternalWalletEnv, method: string): Promise<Response> {
  if (method !== "POST") return json({ detail: "Method not allowed" }, 405);
  const auth = request.headers.get("Authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return json({ detail: "Missing token" }, 401);
  const token = auth.slice(7).trim();
  const sess = await sessionFromBearer(env, token);
  if (!sess) return json({ detail: "Unauthorized" }, 401);
  let body: { withdraw_dest_pubkey?: string | null };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ detail: "Invalid JSON" }, 400);
  }
  const dest = body.withdraw_dest_pubkey == null ? "" : String(body.withdraw_dest_pubkey).trim();
  if (dest) {
    try {
      new PublicKey(dest);
    } catch {
      return json({ detail: "Invalid Solana address." }, 422);
    }
  }
  const now = new Date().toISOString();
  try {
    await env.DB
      .prepare(
        `INSERT INTO rr_earn_custodial_state (account_id, withdraw_dest_pubkey, withdraw_dest_updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(account_id) DO UPDATE SET
           withdraw_dest_pubkey = excluded.withdraw_dest_pubkey,
           withdraw_dest_updated_at = excluded.withdraw_dest_updated_at`,
      )
      .bind(sess.accountId, dest || null, now)
      .run();
  } catch (e) {
    const msg = String(e && typeof e === "object" && "message" in e ? (e as Error).message : e);
    console.error("withdraw_dest", msg);
    return json({ detail: "Could not save withdrawal address." }, 500);
  }
  return json({ ok: true, withdraw_dest_pubkey: dest || null }, 200);
}

export async function handleSolanaInternalWalletRoutes(
  request: Request,
  env: InternalWalletEnv,
  sub: string,
  method: string,
): Promise<Response | null> {
  if (sub !== "/solana/my-wallet") return null;
  if (method !== "GET" && method !== "POST") return json({ detail: "Method not allowed" }, 405);

  const auth = request.headers.get("Authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return json({ detail: "Sign in required." }, 401);
  }
  const token = auth.slice(7).trim();
  const sess = await sessionFromBearer(env, token);
  if (!sess) return json({ detail: "Invalid or expired session." }, 401);

  const pathname = "/v1/me/custodial-sol-wallet" + (method === "GET" ? "" : "");
  return handleCustodialSolWalletV1(
    request,
    env,
    method === "GET" ? "GET" : "POST",
    method === "GET" ? "/v1/me/custodial-sol-wallet" : "/v1/me/custodial-sol-wallet",
  );
}

/**
 * After a new custodial pubkey row exists, top up native SOL from treasury to
 * {@link CUSTODIAL_SOL_RESERVE_LAMPORTS} if the account is below that (same floor as daily cron).
 * Best-effort only — wallet creation still succeeds if this fails (logged).
 */
export async function tryFundCustodialMinimumSolAfterCreate(
  env: InternalWalletEnv,
  custodialPubkeyB58: string,
): Promise<void> {
  const treasurySkB58 = String(env.RRTT_TREASURY_SECRET_KEY_B58 || "").trim();
  if (!treasurySkB58) return;
  let treasury: Keypair;
  try {
    treasury = Keypair.fromSecretKey(bs58.decode(treasurySkB58));
  } catch {
    console.error("tryFundCustodialMinimumSolAfterCreate: bad treasury key");
    return;
  }
  const rpcUrl = String(env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com").trim();
  const connection = new Connection(rpcUrl, "confirmed");
  let custodialPk: PublicKey;
  try {
    custodialPk = new PublicKey(custodialPubkeyB58.trim());
  } catch {
    return;
  }
  const lam = await connection.getBalance(custodialPk, "confirmed").catch(() => -1);
  if (lam < 0) return;
  const target = CUSTODIAL_SOL_RESERVE_LAMPORTS;
  if (lam >= target) return;
  const solTopUpLamports = target - lam;
  const CU = 200_000;
  try {
    const latest = await connection.getLatestBlockhash("confirmed");
    const ixs: TransactionInstruction[] = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: CU }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 0 }),
      SystemProgram.transfer({
        fromPubkey: treasury.publicKey,
        toPubkey: custodialPk,
        lamports: solTopUpLamports,
      }),
    ];
    const msg = new TransactionMessage({
      payerKey: treasury.publicKey,
      recentBlockhash: latest.blockhash,
      instructions: ixs,
    });
    const tx = new VersionedTransaction(msg.compileToV0Message());
    tx.sign([treasury]);
    const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
    await connection.confirmTransaction(
      { signature: sig, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
      "confirmed",
    );
    console.log("custodial create sol fund", custodialPubkeyB58, solTopUpLamports, sig);
  } catch (e) {
    const m = String(e && typeof e === "object" && "message" in e ? (e as Error).message : e);
    console.error("tryFundCustodialMinimumSolAfterCreate", custodialPubkeyB58, m);
  }
}

export type RrttCronEnv = InternalWalletEnv & {
  SOLANA_RPC_URL?: string;
  RRTT_MINT_BASE58?: string;
  RRTT_DECIMALS?: string;
  RRTT_TREASURY_SECRET_KEY_B58?: string;
};

export async function runRrttCustodialPayoutCron(env: RrttCronEnv): Promise<void> {
  const rpcUrl = String(env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com").trim();
  const mintStr = String(env.RRTT_MINT_BASE58 || "").trim();
  const treasurySkB58 = String(env.RRTT_TREASURY_SECRET_KEY_B58 || "").trim();
  if (!mintStr) {
    console.log("rrtt custodial cron: skip (set RRTT_MINT_BASE58 for ATA + balance scan)");
    return;
  }
  const decimals = Math.min(9, Math.max(0, Math.floor(Number(env.RRTT_DECIMALS ?? "0")) || 0));
  let treasury: Keypair | null = null;
  if (treasurySkB58) {
    try {
      treasury = Keypair.fromSecretKey(bs58.decode(treasurySkB58));
    } catch {
      console.error("rrtt custodial cron: bad treasury key (on-chain cache refresh still runs)");
    }
  } else {
    console.log("rrtt custodial cron: no treasury key — on-chain cache refresh only (no treasury→custodial transfers)");
  }
  const canTransfer = Boolean(treasury);
  const mint = new PublicKey(mintStr);
  const connection = new Connection(rpcUrl, "confirmed");
  console.log("rrtt custodial cron start", { rpcUrl: rpcUrl.slice(0, 48) });

  const rows = await env.DB
    .prepare(
      `SELECT la.id AS account_id, lower(la.email) AS email, iw.pubkey AS custodial_b58,
              IFNULL(b.balance, 0) AS earn_balance,
              IFNULL(cs.units_sent_to_custodial, 0) AS sent
       FROM internal_solana_wallets iw
       JOIN license_accounts la ON la.id = iw.account_id
       LEFT JOIN rr_earn_balance b ON b.user_id = ('user:' || lower(la.email))
       LEFT JOIN rr_earn_custodial_state cs ON cs.account_id = iw.account_id`,
    )
    .all<{ account_id: string; email: string; custodial_b58: string; earn_balance: number; sent: number }>();

  const list = rows.results || [];
  const MIN_CUSTODIAL_SOL_LAMPORTS = CUSTODIAL_SOL_RESERVE_LAMPORTS;
  /** CU for SOL top-up + optional 2× ATA + transfer_checked; microLamports 0 = lowest priority fee. */
  const CRON_TX_COMPUTE_UNITS = 600_000;

  for (const r of list) {
    const earnBal = Math.max(0, Math.floor(Number(r.earn_balance) || 0));
    const sent = Math.max(0, Math.floor(Number(r.sent) || 0));
    const pending = Math.max(0, earnBal - sent);
    /** Full earn→custodial gap each run (no partial/fraction transfers). */
    const transferUnits = pending;
    const custodialPk = new PublicKey(r.custodial_b58);
    try {
      const custodialAta = getAssociatedTokenAddressSync(mint, custodialPk, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

      const lamportsCustodial = await connection.getBalance(custodialPk, "confirmed").catch(() => 0);
      const needsSolTopUp = Boolean(treasury) && lamportsCustodial < MIN_CUSTODIAL_SOL_LAMPORTS;
      const solTopUpLamports = needsSolTopUp ? MIN_CUSTODIAL_SOL_LAMPORTS - lamportsCustodial : 0;
      const hasRrttTransfer = transferUnits > 0 && canTransfer && treasury;

      if ((needsSolTopUp || hasRrttTransfer) && treasury) {
        const ixs: TransactionInstruction[] = [
          ComputeBudgetProgram.setComputeUnitLimit({ units: CRON_TX_COMPUTE_UNITS }),
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 0 }),
        ];
        if (solTopUpLamports > 0) {
          ixs.push(
            SystemProgram.transfer({
              fromPubkey: treasury.publicKey,
              toPubkey: custodialPk,
              lamports: solTopUpLamports,
            }),
          );
        }
        if (hasRrttTransfer) {
          const treasuryAta = getAssociatedTokenAddressSync(mint, treasury.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
          const unitsHuman = Math.floor(transferUnits);
          /** Ledger whole RRTT → raw SPL amount. */
          const rawTransfer =
            decimals > 0 ? BigInt(unitsHuman) * 10n ** BigInt(decimals) : BigInt(unitsHuman);
          ixs.push(
            createAssociatedTokenAccountIdempotentInstruction(
              treasury.publicKey,
              treasuryAta,
              treasury.publicKey,
              mint,
              TOKEN_PROGRAM_ID,
              ASSOCIATED_TOKEN_PROGRAM_ID,
            ),
            createAssociatedTokenAccountIdempotentInstruction(
              treasury.publicKey,
              custodialAta,
              custodialPk,
              mint,
              TOKEN_PROGRAM_ID,
              ASSOCIATED_TOKEN_PROGRAM_ID,
            ),
            createTransferCheckedInstruction(
              treasuryAta,
              mint,
              custodialAta,
              treasury.publicKey,
              rawTransfer,
              decimals,
              [],
              TOKEN_PROGRAM_ID,
            ),
          );
        }

        const latest = await connection.getLatestBlockhash("confirmed");
        const msg = new TransactionMessage({
          payerKey: treasury.publicKey,
          recentBlockhash: latest.blockhash,
          instructions: ixs,
        });
        const tx = new VersionedTransaction(msg.compileToV0Message());
        tx.sign([treasury]);
        const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
        await connection.confirmTransaction(
          { signature: sig, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
          "confirmed",
        );
        if (solTopUpLamports > 0) {
          console.log("rrtt custodial sol topup", r.account_id, solTopUpLamports, sig);
        }
        if (hasRrttTransfer) {
          const now = new Date().toISOString();
          await env.DB.prepare("INSERT OR IGNORE INTO rr_earn_custodial_state (account_id) VALUES (?)").bind(r.account_id).run();
          const curRow = await env.DB
            .prepare("SELECT units_sent_to_custodial FROM rr_earn_custodial_state WHERE account_id = ?")
            .bind(r.account_id)
            .first<{ units_sent_to_custodial: number }>();
          const curSent = Math.max(0, Math.floor(Number(curRow?.units_sent_to_custodial) || 0));
          const newSent = curSent + transferUnits;
          await env.DB
            .prepare(
              `UPDATE rr_earn_custodial_state SET units_sent_to_custodial = ?, last_treasury_transfer_at = ?, last_treasury_transfer_sig = ? WHERE account_id = ?`,
            )
            .bind(newSent, now, sig, r.account_id)
            .run();
          try {
            await insertTreasuryToCustodialLedger(env.DB, {
              accountId: r.account_id,
              emailLower: String(r.email || "").toLowerCase(),
              units: transferUnits,
              txSignature: sig,
              earnBalanceSnapshot: earnBal,
            });
          } catch (e) {
            const m = String(e && typeof e === "object" && "message" in e ? (e as Error).message : e);
            console.error("ledger insert treasury", r.account_id, m);
          }
          console.log("rrtt transfer ok", r.account_id, transferUnits, "of", pending, "pending", sig);
        }
      }

      const bal = await connection.getTokenAccountBalance(custodialAta).catch(() => null);
      const lamports = await connection.getBalance(custodialPk, "confirmed").catch(() => 0);
      /** Match earn ledger “whole token” style: prefer RPC uiAmount (human), else raw / 10^decimals. */
      let onchain: number | null = null;
      if (bal?.value) {
        const ui = bal.value.uiAmount;
        if (ui != null && Number.isFinite(ui)) {
          onchain = Math.floor(ui);
        } else if (bal.value.amount != null) {
          const raw = Math.floor(Number(bal.value.amount) || 0);
          const div = decimals > 0 ? 10 ** decimals : 1;
          onchain = Math.floor(raw / div);
        }
      }
      const now2 = new Date().toISOString();
      await env.DB.prepare("INSERT OR IGNORE INTO rr_earn_custodial_state (account_id) VALUES (?)").bind(r.account_id).run();
      await env.DB
        .prepare(
          `UPDATE rr_earn_custodial_state SET custodial_rrtt_onchain = ?, sol_balance_lamports_cached = ?, cache_updated_at = ? WHERE account_id = ?`,
        )
        .bind(onchain, lamports, now2, r.account_id)
        .run();
    } catch (e) {
      const msg = String(e && typeof e === "object" && "message" in e ? (e as Error).message : e);
      console.error("rrtt cron row", r.account_id, msg);
    }
  }
}

/** POST `/api/internal/run-rrtt-custodial-cron` — same as scheduled 07:00 job; `X-RR-Push-Admin-Key` required. */
export async function handleRunRrttCustodialCronRoute(
  request: Request,
  env: CustodialBackfillEnv & RrttCronEnv,
  sub: string,
  method: string,
): Promise<Response | null> {
  if (method !== "POST" || sub !== "/internal/run-rrtt-custodial-cron") return null;
  const secret = (env.RR_PUSH_ADMIN_SECRET || "").trim();
  if (!secret) {
    return json({ ok: false, detail: "RR_PUSH_ADMIN_SECRET is not set on this Worker." }, 503);
  }
  const adminOk = await verifyWorkerOpsAdmin(request, env);
  if (!adminOk) {
    const has = Boolean(request.headers.get("X-RR-Push-Admin-Key"));
    return json({ ok: false, detail: has ? "Invalid admin key." : "Missing X-RR-Push-Admin-Key header." }, 401);
  }
  try {
    await runRrttCustodialPayoutCron(env);
    return json({ ok: true, detail: "RRTT custodial payout cron finished." }, 200);
  } catch (e) {
    const m = String(e && typeof e === "object" && "message" in e ? (e as Error).message : e);
    console.error("run-rrtt-custodial-cron", m);
    return json({ ok: false, detail: m }, 500);
  }
}
