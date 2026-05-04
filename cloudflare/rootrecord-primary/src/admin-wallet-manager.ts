import { json } from "./cors";
import { sessionFromBearer, type AuthEnv } from "./primary-auth";

/** Only this portal login may load wallet data (must match `license_accounts` email). */
const WALLET_ADMIN_EMAIL = "rootrecord@outlook.com";

/** Canonical Solana Tools UI lives on Vercel (`RootRecord/solana-rootrecord-site`), not this Worker. */
const WALLET_MANAGER_UI_URL = "https://solana.rootrecord.info/internal/wallet-manager";

type WalletManagerEnv = AuthEnv;

type InternalRow = { account_id: string; pubkey: string; created_at: string };
type LinkedRow = {
  account_id: string;
  pubkey: string;
  verified_at: string;
  message_preview: string;
};

export async function handleWalletManagerRoutes(
  request: Request,
  env: WalletManagerEnv,
  sub: string,
  method: string
): Promise<Response | null> {
  if (method === "GET" && sub === "/internal/wallet-manager") {
    return Response.redirect(WALLET_MANAGER_UI_URL, 302);
  }

  if (method === "GET" && sub === "/internal/wallet-manager/data") {
    const auth = request.headers.get("Authorization") || "";
    if (!auth.toLowerCase().startsWith("bearer ")) {
      return json({ ok: false, detail: "Sign in required. Use Authorization: Bearer (session JWT)." }, 401);
    }
    const token = auth.slice(7).trim();
    const sess = await sessionFromBearer(env, token);
    if (!sess) {
      return json({ ok: false, detail: "Invalid or expired session." }, 401);
    }
    const email = sess.email.trim().toLowerCase();
    if (email !== WALLET_ADMIN_EMAIL) {
      return json({ ok: false, detail: "Forbidden." }, 403);
    }

    const internalRes = await env.DB.prepare(
      `SELECT account_id, pubkey, created_at FROM internal_solana_wallets ORDER BY datetime(created_at) DESC LIMIT 500`
    ).all<InternalRow>();

    const linkedRes = await env.DB.prepare(
      `SELECT account_id, pubkey, verified_at, message_preview FROM solana_linked_wallets ORDER BY datetime(verified_at) DESC LIMIT 500`
    ).all<LinkedRow>();

    return json({
      ok: true,
      internal: internalRes.results ?? [],
      linked: linkedRes.results ?? [],
    });
  }

  return null;
}
