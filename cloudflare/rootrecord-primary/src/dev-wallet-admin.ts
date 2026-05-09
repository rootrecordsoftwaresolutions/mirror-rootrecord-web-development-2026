import type { D1Database } from "@cloudflare/workers-types";

import { Connection, ComputeBudgetProgram, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createBurnCheckedInstruction,
  createCloseAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

import { json } from "./cors";
import { verifyWorkerOpsAdmin } from "./push";
import { sessionFromBearer, type AuthEnv } from "./primary-auth";
import { loadKeypairForAccount, type InternalWalletEnv } from "./solana-internal-wallet";

const ADMIN_EMAIL = "rootrecord@outlook.com";

export type DevWalletAdminEnv = InternalWalletEnv & {
  DEV_WALLET_ADMIN_ENABLED?: string;
};

function devEnabled(env: DevWalletAdminEnv): boolean {
  return String(env.DEV_WALLET_ADMIN_ENABLED || "").trim() === "1";
}

function bearerToken(request: Request): string | null {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  const t = auth.slice(7).trim();
  return t ? t : null;
}

async function requireDevWalletAdmin(env: DevWalletAdminEnv, request: Request) {
  const tok = bearerToken(request);
  if (!tok) return { ok: false as const, res: json({ detail: "Unauthorized" }, 401) };
  const sess = await sessionFromBearer(env, tok);
  if (!sess) return { ok: false as const, res: json({ detail: "Unauthorized" }, 401) };
  const email = String(sess.email || "").trim().toLowerCase();
  if (email !== ADMIN_EMAIL) return { ok: false as const, res: json({ detail: "Forbidden" }, 403) };
  /** Prod: same secret as push-broadcast (`X-RR-Push-Admin-Key` / `RR_PUSH_ADMIN_SECRET`). Local: `DEV_WALLET_ADMIN_ENABLED=1`. */
  const allowed = devEnabled(env) || (await verifyWorkerOpsAdmin(request, env));
  if (!allowed) return { ok: false as const, res: json({ detail: "Not found" }, 404) };
  return { ok: true as const, sess };
}

function rpcUrl(env: { SOLANA_RPC_URL?: string }): string {
  return String(env.SOLANA_RPC_URL || "").trim() || "https://api.mainnet-beta.solana.com";
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function textParam(u: URL, k: string, maxLen: number): string | null {
  const v = u.searchParams.get(k);
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function parseUiToRaw(ui: string, decimals: number): bigint | null {
  const s = String(ui || "").trim();
  if (!s) return null;
  if (!Number.isFinite(decimals) || decimals < 0 || decimals > 18) return null;
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const [a, bRaw] = s.split(".");
  const b = (bRaw || "").slice(0, decimals);
  const frac = b.padEnd(decimals, "0");
  try {
    const whole = BigInt(a || "0");
    const fracInt = decimals > 0 ? BigInt(frac || "0") : 0n;
    return whole * 10n ** BigInt(decimals) + fracInt;
  } catch {
    return null;
  }
}

async function listWallets(db: D1Database, cursor: string | null, limit: number) {
  const rows = await db
    .prepare(
      `SELECT iw.account_id, iw.pubkey, iw.created_at, la.email
       FROM internal_solana_wallets iw
       LEFT JOIN license_accounts la ON la.id = iw.account_id
       WHERE (? IS NULL OR iw.created_at < ?)
       ORDER BY iw.created_at DESC
       LIMIT ?`,
    )
    .bind(cursor, cursor, limit)
    .all<{ account_id: string; pubkey: string; created_at: string; email: string | null }>();
  const items = (rows.results || []).map((r) => ({
    account_id: String(r.account_id || "").trim(),
    pubkey: String(r.pubkey || "").trim(),
    created_at: String(r.created_at || "").trim(),
    email: r.email == null ? null : String(r.email || "").trim(),
  }));
  const nextCursor = items.length ? items[items.length - 1]!.created_at : null;
  return { items, next_cursor: nextCursor };
}

async function walletOverview(env: DevWalletAdminEnv, accountId: string) {
  const kp = await loadKeypairForAccount(env, accountId);
  if (!kp) return { ok: false as const, res: json({ detail: "Wallet missing or cannot decrypt key." }, 404) };
  const connection = new Connection(rpcUrl(env), "confirmed");
  const pk = kp.publicKey;
  const sol = await connection.getBalance(pk, "confirmed").catch(() => -1);
  const parsed = await connection.getParsedTokenAccountsByOwner(pk, { programId: TOKEN_PROGRAM_ID }, "confirmed").catch(() => null);
  const token_accounts =
    parsed?.value?.map((v) => {
      const info: any = v.account?.data?.parsed?.info;
      const mint = String(info?.mint || "").trim();
      const owner = String(info?.owner || "").trim();
      const amount = info?.tokenAmount || {};
      return {
        token_account: v.pubkey.toBase58(),
        mint: mint || null,
        owner: owner || null,
        amount_raw: typeof amount.amount === "string" ? amount.amount : null,
        decimals: typeof amount.decimals === "number" ? amount.decimals : null,
        ui_amount: typeof amount.uiAmount === "number" ? amount.uiAmount : null,
        ui_amount_string: typeof amount.uiAmountString === "string" ? amount.uiAmountString : null,
      };
    }) || [];
  return {
    ok: true as const,
    data: {
      account_id: accountId,
      pubkey: pk.toBase58(),
      sol_balance_lamports: sol >= 0 ? sol : null,
      token_accounts,
    },
  };
}

async function sendSolFromCustodial(env: DevWalletAdminEnv, accountId: string, toPubkeyB58: string, lamports: number) {
  const kp = await loadKeypairForAccount(env, accountId);
  if (!kp) return json({ detail: "Wallet missing or cannot decrypt key." }, 404);
  let toPk: PublicKey;
  try {
    toPk = new PublicKey(String(toPubkeyB58 || "").trim());
  } catch {
    return json({ detail: "Invalid to_pubkey_base58." }, 422);
  }
  const l = clampInt(Number(lamports), 1, 10_000_000_000);
  const connection = new Connection(rpcUrl(env), "confirmed");
  const latest = await connection.getLatestBlockhash("confirmed");
  const ixs = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 120_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 0 }),
    SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: toPk, lamports: l }),
  ];
  const msg = new TransactionMessage({
    payerKey: kp.publicKey,
    recentBlockhash: latest.blockhash,
    instructions: ixs,
  });
  const tx = new VersionedTransaction(msg.compileToV0Message());
  tx.sign([kp]);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  await connection.confirmTransaction(
    { signature: sig, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
    "confirmed",
  );
  return json({ ok: true, signature: sig }, 200);
}

async function transferSplFromCustodial(
  env: DevWalletAdminEnv,
  accountId: string,
  mintB58: string,
  toOwnerB58: string,
  amountUi: string,
  decimals: number,
) {
  const kp = await loadKeypairForAccount(env, accountId);
  if (!kp) return json({ detail: "Wallet missing or cannot decrypt key." }, 404);

  let mint: PublicKey;
  let toOwner: PublicKey;
  try {
    mint = new PublicKey(String(mintB58 || "").trim());
  } catch {
    return json({ detail: "Invalid mint_base58." }, 422);
  }
  try {
    toOwner = new PublicKey(String(toOwnerB58 || "").trim());
  } catch {
    return json({ detail: "Invalid to_owner_base58." }, 422);
  }

  const d = clampInt(Number(decimals), 0, 18);
  const raw = parseUiToRaw(String(amountUi || "").trim(), d);
  if (raw == null || raw <= 0n) return json({ detail: "Invalid amount_ui for decimals." }, 422);

  const fromAta = getAssociatedTokenAddressSync(mint, kp.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const toAta = getAssociatedTokenAddressSync(mint, toOwner, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

  const connection = new Connection(rpcUrl(env), "confirmed");
  const latest = await connection.getLatestBlockhash("confirmed");
  const ixs = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 260_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 0 }),
    createAssociatedTokenAccountIdempotentInstruction(kp.publicKey, toAta, toOwner, mint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID),
    createTransferCheckedInstruction(fromAta, mint, toAta, kp.publicKey, raw, d, [], TOKEN_PROGRAM_ID),
  ];

  const msg = new TransactionMessage({
    payerKey: kp.publicKey,
    recentBlockhash: latest.blockhash,
    instructions: ixs,
  });
  const tx = new VersionedTransaction(msg.compileToV0Message());
  tx.sign([kp]);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  await connection.confirmTransaction(
    { signature: sig, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
    "confirmed",
  );
  return json({ ok: true, signature: sig, from_ata: fromAta.toBase58(), to_ata: toAta.toBase58() }, 200);
}

async function burnSplFromCustodial(env: DevWalletAdminEnv, accountId: string, mintB58: string, amountUi: string, decimals: number) {
  const kp = await loadKeypairForAccount(env, accountId);
  if (!kp) return json({ detail: "Wallet missing or cannot decrypt key." }, 404);
  let mint: PublicKey;
  try {
    mint = new PublicKey(String(mintB58 || "").trim());
  } catch {
    return json({ detail: "Invalid mint_base58." }, 422);
  }
  const d = clampInt(Number(decimals), 0, 18);
  const raw = parseUiToRaw(String(amountUi || "").trim(), d);
  if (raw == null || raw <= 0n) return json({ detail: "Invalid amount_ui for decimals." }, 422);

  const ata = getAssociatedTokenAddressSync(mint, kp.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const connection = new Connection(rpcUrl(env), "confirmed");
  const latest = await connection.getLatestBlockhash("confirmed");
  const ixs = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 160_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 0 }),
    createBurnCheckedInstruction(ata, mint, kp.publicKey, raw, d, [], TOKEN_PROGRAM_ID),
  ];
  const msg = new TransactionMessage({
    payerKey: kp.publicKey,
    recentBlockhash: latest.blockhash,
    instructions: ixs,
  });
  const tx = new VersionedTransaction(msg.compileToV0Message());
  tx.sign([kp]);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  await connection.confirmTransaction(
    { signature: sig, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
    "confirmed",
  );
  return json({ ok: true, signature: sig, ata: ata.toBase58() }, 200);
}

async function closeEmptyAta(env: DevWalletAdminEnv, accountId: string, tokenAccountB58: string, destinationB58: string) {
  const kp = await loadKeypairForAccount(env, accountId);
  if (!kp) return json({ detail: "Wallet missing or cannot decrypt key." }, 404);
  let tokenAccount: PublicKey;
  let dest: PublicKey;
  try {
    tokenAccount = new PublicKey(String(tokenAccountB58 || "").trim());
  } catch {
    return json({ detail: "Invalid token_account_base58." }, 422);
  }
  try {
    dest = new PublicKey(String(destinationB58 || "").trim());
  } catch {
    return json({ detail: "Invalid destination_base58." }, 422);
  }

  const connection = new Connection(rpcUrl(env), "confirmed");
  const latest = await connection.getLatestBlockhash("confirmed");
  const ixs = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 140_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 0 }),
    createCloseAccountInstruction(tokenAccount, dest, kp.publicKey, [], TOKEN_PROGRAM_ID),
  ];
  const msg = new TransactionMessage({
    payerKey: kp.publicKey,
    recentBlockhash: latest.blockhash,
    instructions: ixs,
  });
  const tx = new VersionedTransaction(msg.compileToV0Message());
  tx.sign([kp]);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  await connection.confirmTransaction(
    { signature: sig, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
    "confirmed",
  );
  return json({ ok: true, signature: sig }, 200);
}

/**
 * Dev-only privileged wallet admin routes (never enabled in prod).
 *
 * Base: `/api/dev/wallet-admin/*` (router passes `sub` without `/api` prefix).
 */
export async function handleDevWalletAdminRoutes(
  request: Request,
  env: DevWalletAdminEnv,
  sub: string,
  method: string,
): Promise<Response | null> {
  if (!sub.startsWith("/dev/wallet-admin")) return null;

  const gate = await requireDevWalletAdmin(env, request);
  if (!gate.ok) return gate.res;

  const url = new URL(request.url);
  const base = "/dev/wallet-admin";
  const rest = sub === base ? "" : sub.slice(base.length);

  if (method === "GET" && rest === "/wallets") {
    const lim = clampInt(Number(textParam(url, "limit", 10) || "50"), 1, 200);
    const cursor = textParam(url, "cursor", 64);
    const r = await listWallets(env.DB, cursor, lim);
    return json({ ok: true, ...r }, 200);
  }

  if (method === "GET" && rest.startsWith("/wallet/") && rest.endsWith("/overview")) {
    const middle = rest.slice("/wallet/".length, rest.length - "/overview".length);
    const accountId = middle.replace(/\/+/g, "/").replace(/^\//, "").replace(/\/$/, "").trim();
    if (!accountId) return json({ detail: "Missing accountId." }, 422);
    const r = await walletOverview(env, accountId);
    if (!r.ok) return r.res;
    return json({ ok: true, ...r.data }, 200);
  }

  if (method === "POST" && rest.startsWith("/wallet/") && rest.endsWith("/transfer-sol")) {
    const middle = rest.slice("/wallet/".length, rest.length - "/transfer-sol".length);
    const accountId = middle.replace(/\/+/g, "/").replace(/^\//, "").replace(/\/$/, "").trim();
    if (!accountId) return json({ detail: "Missing accountId." }, 422);
    let body: { to_pubkey_base58?: string; lamports?: number };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return json({ detail: "Invalid JSON" }, 400);
    }
    return await sendSolFromCustodial(env, accountId, String(body.to_pubkey_base58 || ""), Number(body.lamports || 0));
  }

  if (method === "POST" && rest.startsWith("/wallet/") && rest.endsWith("/transfer-spl")) {
    const middle = rest.slice("/wallet/".length, rest.length - "/transfer-spl".length);
    const accountId = middle.replace(/\/+/g, "/").replace(/^\//, "").replace(/\/$/, "").trim();
    if (!accountId) return json({ detail: "Missing accountId." }, 422);
    let body: { mint_base58?: string; to_owner_base58?: string; amount_ui?: string; decimals?: number };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return json({ detail: "Invalid JSON" }, 400);
    }
    return await transferSplFromCustodial(
      env,
      accountId,
      String(body.mint_base58 || ""),
      String(body.to_owner_base58 || ""),
      String(body.amount_ui || ""),
      Number(body.decimals),
    );
  }

  if (method === "POST" && rest.startsWith("/wallet/") && rest.endsWith("/burn-spl")) {
    const middle = rest.slice("/wallet/".length, rest.length - "/burn-spl".length);
    const accountId = middle.replace(/\/+/g, "/").replace(/^\//, "").replace(/\/$/, "").trim();
    if (!accountId) return json({ detail: "Missing accountId." }, 422);
    let body: { mint_base58?: string; amount_ui?: string; decimals?: number };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return json({ detail: "Invalid JSON" }, 400);
    }
    return await burnSplFromCustodial(env, accountId, String(body.mint_base58 || ""), String(body.amount_ui || ""), Number(body.decimals));
  }

  if (method === "POST" && rest.startsWith("/wallet/") && rest.endsWith("/close-empty-ata")) {
    const middle = rest.slice("/wallet/".length, rest.length - "/close-empty-ata".length);
    const accountId = middle.replace(/\/+/g, "/").replace(/^\//, "").replace(/\/$/, "").trim();
    if (!accountId) return json({ detail: "Missing accountId." }, 422);
    let body: { token_account_base58?: string; destination_base58?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return json({ detail: "Invalid JSON" }, 400);
    }
    return await closeEmptyAta(env, accountId, String(body.token_account_base58 || ""), String(body.destination_base58 || ""));
  }

  return json({ detail: "Not found" }, 404);
}

