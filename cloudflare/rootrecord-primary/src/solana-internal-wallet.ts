import type { D1Database } from "@cloudflare/workers-types";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
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
import { sessionFromBearer, type AuthEnv } from "./primary-auth";
import { notifySolanaToolsDiscord } from "./discord-solana-notify";
import { insertTreasuryToCustodialLedger } from "./earn-rewards-ledger";

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

/** Create custodial keypair if missing; safe to call on signup (no-op if disabled or exists). */
export async function provisionCustodialWalletIfMissing(env: InternalWalletEnv, accountId: string): Promise<void> {
  const aesKey = await importAesKeyFromEnv(env);
  if (!aesKey) return;
  const existing = await readWalletRow(env.DB, accountId);
  if (existing) return;
  const kp = Keypair.generate();
  const enc = await aesGcmEncrypt(aesKey, kp.secretKey);
  try {
    await env.DB
      .prepare(
        "INSERT INTO internal_solana_wallets (account_id, pubkey, privkey_pkcs8_enc, privkey_iv) VALUES (?, ?, ?, ?)",
      )
      .bind(accountId, kp.publicKey.toBase58(), enc.ct, enc.iv)
      .run();
    try {
      await env.DB
        .prepare("INSERT OR IGNORE INTO rr_earn_custodial_state (account_id) VALUES (?)")
        .bind(accountId)
        .run();
    } catch {
      /* rr_earn_custodial_state until migration 0027 */
    }
  } catch (e) {
    const msg = String(e && typeof e === "object" && "message" in e ? (e as Error).message : e);
    console.error("provisionCustodialWalletIfMissing", accountId, msg);
  }
  const msg =
    `**Solana tools — custodial wallet (signup auto)**\n` +
    `**Account:** \`${accountId}\`\n` +
    `**Pubkey:** \`${kp.publicKey.toBase58()}\`\n`;
  await notifySolanaToolsDiscord(env.DISCORD_WEBHOOK_SOLANA_TOOLS, msg);
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
      return json(
        { ok: false, detail: "Internal wallet encryption is not configured. Set INTERNAL_WALLET_ENC_KEY_B64.", custodial_enabled: false },
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
      const detail = /no such table/i.test(msg)
        ? "Database is missing custodial tables. Apply D1 migrations (internal_solana_wallets)."
        : "Could not create custodial wallet.";
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
  if (!mintStr || !treasurySkB58) {
    console.log("rrtt custodial cron: skip (set RRTT_MINT_BASE58 and RRTT_TREASURY_SECRET_KEY_B58)");
    return;
  }
  const decimals = Math.min(9, Math.max(0, Math.floor(Number(env.RRTT_DECIMALS ?? "0")) || 0));
  let treasury: Keypair;
  try {
    treasury = Keypair.fromSecretKey(bs58.decode(treasurySkB58));
  } catch {
    console.error("rrtt custodial cron: bad treasury key");
    return;
  }
  const mint = new PublicKey(mintStr);
  const connection = new Connection(rpcUrl, "confirmed");

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
  for (const r of list) {
    const earnBal = Math.max(0, Math.floor(Number(r.earn_balance) || 0));
    const sent = Math.max(0, Math.floor(Number(r.sent) || 0));
    const pending = Math.max(0, earnBal - sent);
    const custodialPk = new PublicKey(r.custodial_b58);
    try {
      const custodialAta = getAssociatedTokenAddressSync(mint, custodialPk, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
      const treasuryAta = getAssociatedTokenAddressSync(mint, treasury.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

      if (pending > 0) {
        const latest = await connection.getLatestBlockhash("confirmed");
        const ixs = [
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
            BigInt(pending),
            decimals,
            [],
            TOKEN_PROGRAM_ID,
          ),
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
        const now = new Date().toISOString();
        await env.DB.prepare("INSERT OR IGNORE INTO rr_earn_custodial_state (account_id) VALUES (?)").bind(r.account_id).run();
        const curRow = await env.DB
          .prepare("SELECT units_sent_to_custodial FROM rr_earn_custodial_state WHERE account_id = ?")
          .bind(r.account_id)
          .first<{ units_sent_to_custodial: number }>();
        const curSent = Math.max(0, Math.floor(Number(curRow?.units_sent_to_custodial) || 0));
        const newSent = curSent + pending;
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
            units: pending,
            txSignature: sig,
            earnBalanceSnapshot: earnBal,
          });
        } catch (e) {
          const m = String(e && typeof e === "object" && "message" in e ? (e as Error).message : e);
          console.error("ledger insert treasury", r.account_id, m);
        }
        console.log("rrtt transfer ok", r.account_id, pending, sig);
      }

      const bal = await connection.getTokenAccountBalance(custodialAta).catch(() => null);
      const lamports = await connection.getBalance(custodialPk, "confirmed").catch(() => 0);
      const onchain = bal?.value?.amount != null ? Math.floor(Number(bal.value.amount) || 0) : null;
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
