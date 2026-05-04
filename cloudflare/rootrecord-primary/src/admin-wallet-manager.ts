import { json } from "./cors";
import { sessionFromBearer, type AuthEnv } from "./primary-auth";

/** Only this portal login may load wallet data (must match `license_accounts` email). */
const WALLET_ADMIN_EMAIL = "rootrecord@outlook.com";

type WalletManagerEnv = AuthEnv;

type InternalRow = { account_id: string; pubkey: string; created_at: string };
type LinkedRow = {
  account_id: string;
  pubkey: string;
  verified_at: string;
  message_preview: string;
};

const PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex, nofollow"/>
<title>Wallet manager — RootRecord</title>
<style>
  :root { --bg: #0a0e14; --fg: #e6edf3; --muted: #8b949e; --line: #21262d; --accent: #3fb950; --err: #f85149; }
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, sans-serif; background: var(--bg); color: var(--fg); margin: 0; padding: 1.5rem; max-width: 1100px; margin-inline: auto; }
  h1 { font-size: 1.25rem; font-weight: 600; margin: 0 0 0.5rem; }
  p.note { color: var(--muted); font-size: 0.875rem; margin: 0 0 1rem; max-width: 52ch; }
  label { display: block; font-size: 0.75rem; color: var(--muted); margin-bottom: 0.35rem; text-transform: uppercase; letter-spacing: 0.06em; }
  textarea { width: 100%; min-height: 4.5rem; background: #161b22; border: 1px solid var(--line); color: var(--fg); border-radius: 6px; padding: 0.6rem 0.75rem; font-family: ui-monospace, monospace; font-size: 0.8rem; resize: vertical; }
  button { margin-top: 0.75rem; background: var(--accent); color: #0a0e14; border: none; padding: 0.5rem 1rem; border-radius: 6px; font-weight: 600; cursor: pointer; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .err { color: var(--err); font-size: 0.875rem; margin-top: 0.75rem; white-space: pre-wrap; }
  section { margin-top: 2rem; }
  section h2 { font-size: 1rem; margin: 0 0 0.75rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
  th, td { text-align: left; padding: 0.5rem 0.6rem; border-bottom: 1px solid var(--line); vertical-align: top; word-break: break-all; }
  th { color: var(--muted); font-weight: 500; }
  .muted { color: var(--muted); font-size: 0.75rem; }
</style>
</head>
<body>
  <h1>Wallet manager</h1>
  <p class="note">Authorized for <strong>${WALLET_ADMIN_EMAIL}</strong> only. Paste your RootRecord session JWT (same token as <code>rootrecord_portal_token</code> on rootrecord.info after signing in), then load D1 rows. Custodial private keys are never sent to the browser.</p>
  <div>
    <label for="tok">Session token (Bearer)</label>
    <textarea id="tok" placeholder="eyJ…" autocomplete="off" spellcheck="false"></textarea>
    <button type="button" id="go">Load wallets</button>
    <div id="msg" class="err" aria-live="polite"></div>
  </div>
  <section>
    <h2>Custodial / internal (<code>internal_solana_wallets</code>)</h2>
    <p class="muted">pubkey + account_id + created_at. Encrypted key material stays in D1 only.</p>
    <div id="intWrap"></div>
  </section>
  <section>
    <h2>Linked self-custody (<code>solana_linked_wallets</code>)</h2>
    <div id="linkWrap"></div>
  </section>
<script>
(function () {
  var API = "/api/internal/wallet-manager/data";
  var msg = document.getElementById("msg");
  var go = document.getElementById("go");
  var tok = document.getElementById("tok");
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }
  function tbl(rows, cols) {
    if (!rows.length) return "<p class=\\"muted\\">No rows.</p>";
    var h = "<table><thead><tr>" + cols.map(function (c) { return "<th>" + esc(c.label) + "</th>"; }).join("") + "</tr></thead><tbody>";
    rows.forEach(function (r) {
      h += "<tr>" + cols.map(function (c) { return "<td>" + esc(r[c.key]) + "</td>"; }).join("") + "</tr>";
    });
    return h + "</tbody></table>";
  }
  go.onclick = function () {
    msg.textContent = "";
    var t = tok.value.trim();
    if (!t) { msg.textContent = "Paste your session token."; return; }
    go.disabled = true;
    fetch(API, { headers: { "Authorization": "Bearer " + t, "Accept": "application/json" } })
      .then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); })
      .then(function (x) {
        if (!x.r.ok) {
          msg.textContent = (x.j && x.j.detail) ? x.j.detail : ("HTTP " + x.r.status);
          return;
        }
        if (!x.j.ok) { msg.textContent = "Unexpected response."; return; }
        document.getElementById("intWrap").innerHTML = tbl(x.j.internal || [], [
          { key: "account_id", label: "account_id" },
          { key: "pubkey", label: "pubkey" },
          { key: "created_at", label: "created_at" }
        ]);
        document.getElementById("linkWrap").innerHTML = tbl(x.j.linked || [], [
          { key: "account_id", label: "account_id" },
          { key: "pubkey", label: "pubkey" },
          { key: "verified_at", label: "verified_at" },
          { key: "message_preview", label: "message_preview" }
        ]);
      })
      .catch(function (e) { msg.textContent = String(e && e.message ? e.message : e); })
      .finally(function () { go.disabled = false; });
  };
})();
</script>
</body>
</html>`;

export async function handleWalletManagerRoutes(
  request: Request,
  env: WalletManagerEnv,
  sub: string,
  method: string
): Promise<Response | null> {
  if (method === "GET" && sub === "/internal/wallet-manager") {
    return new Response(PAGE_HTML, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
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
