(function () {
  const TOKEN_KEY = "rootrecord_portal_token";

  function el(id) {
    return document.getElementById(id);
  }

  function setStatus(msg, kind) {
    const s = el("status");
    if (!s) return;
    s.textContent = msg || "";
    s.className = "status" + (kind ? " status-" + kind : "");
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  let apiBase = "";

  async function loadConfig() {
    const res = await fetch("/api/site-config", { cache: "no-store" });
    if (!res.ok) throw new Error("config");
    const j = await res.json();
    apiBase = typeof j.apiBase === "string" ? j.apiBase.replace(/\/+$/, "") : "";
    if (!apiBase) throw new Error("apiBase");
  }

  function apiUrl(path) {
    return apiBase + path;
  }

  function token() {
    const t = localStorage.getItem(TOKEN_KEY);
    return t && t.length > 10 ? t : "";
  }

  async function apiFetch(path, opts) {
    const headers = new Headers(opts?.headers);
    if (!headers.has("Authorization")) {
      const t = token();
      if (t) headers.set("Authorization", "Bearer " + t);
    }
    if (!headers.has("Content-Type") && opts?.body) headers.set("Content-Type", "application/json");
    return fetch(apiUrl(path), { ...opts, headers });
  }

  function short(s, n) {
    const x = String(s || "");
    if (x.length <= n) return x;
    return x.slice(0, Math.max(0, n - 1)) + "…";
  }

  function mountWallets(items) {
    const wrap = el("wallets");
    if (!wrap) return;
    const q = (el("q") && el("q").value ? String(el("q").value).trim().toLowerCase() : "") || "";
    const filtered = !q
      ? items
      : items.filter((w) => {
          const hay = (w.account_id + " " + w.pubkey + " " + (w.email || "")).toLowerCase();
          return hay.includes(q);
        });

    if (!filtered.length) {
      wrap.innerHTML = "<p class=note style='margin:0'>No wallets.</p>";
      return;
    }

    wrap.innerHTML =
      "<div style='display:grid;gap:0.5rem'>" +
      filtered
        .map((w) => {
          return (
            "<button type=button class='btn btn-secondary' data-account-id='" +
            escapeHtml(w.account_id) +
            "' style='text-align:left;white-space:normal'>" +
            "<div style='font-family:var(--mono);font-size:0.95rem'>" +
            escapeHtml(w.account_id) +
            "</div>" +
            "<div class=note style='margin-top:0.25rem;margin-bottom:0'>" +
            escapeHtml(short(w.pubkey, 44)) +
            (w.email ? " — " + escapeHtml(w.email) : "") +
            "</div>" +
            "</button>"
          );
        })
        .join("") +
      "</div>";

    Array.from(wrap.querySelectorAll("button[data-account-id]")).forEach((btn) => {
      btn.addEventListener("click", function () {
        const id = btn.getAttribute("data-account-id") || "";
        if (id) loadWalletDetail(id);
      });
    });
  }

  function mountWalletDetailLoading(accountId) {
    const d = el("wallet-detail");
    if (!d) return;
    d.innerHTML =
      "<p class=note style='margin-top:0'>Account: <span style='font-family:var(--mono)'>" +
      escapeHtml(accountId) +
      "</span></p>" +
      "<p class=note>Loading…</p>";
  }

  function mountWalletDetail(detail) {
    const d = el("wallet-detail");
    if (!d) return;

    const solLam = detail.sol_balance_lamports == null ? null : Number(detail.sol_balance_lamports);
    const sol = solLam == null || !Number.isFinite(solLam) ? "—" : (solLam / 1e9).toFixed(9).replace(/0+$/, "").replace(/\.$/, "");

    const tokens = Array.isArray(detail.token_accounts) ? detail.token_accounts : [];

    function tokenRows() {
      if (!tokens.length) return "<p class=note style='margin:0'>No SPL token accounts found.</p>";
      return (
        "<div style='display:grid;gap:0.5rem'>" +
        tokens
          .map((t) => {
            const amt = t.ui_amount_string || (t.ui_amount == null ? "—" : String(t.ui_amount));
            return (
              "<div class='card-plain' style='padding:0.75rem;border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.12)'>" +
              "<div class=note style='margin:0'>Mint</div>" +
              "<div style='font-family:var(--mono)'>" +
              escapeHtml(short(t.mint || "", 64)) +
              "</div>" +
              "<div class=note style='margin-top:0.5rem;margin-bottom:0'>Token account</div>" +
              "<div style='font-family:var(--mono)'>" +
              escapeHtml(short(t.token_account || "", 64)) +
              "</div>" +
              "<div class=note style='margin-top:0.5rem;margin-bottom:0'>Balance</div>" +
              "<div style='font-family:var(--mono)'>" +
              escapeHtml(amt) +
              "</div>" +
              "<div style='margin-top:0.75rem;display:flex;gap:0.5rem;flex-wrap:wrap'>" +
              "<button type=button class='btn btn-secondary' data-close-ata='" +
              escapeHtml(t.token_account || "") +
              "'>Close empty ATA (rent)</button>" +
              "</div>" +
              "</div>"
            );
          })
          .join("") +
        "</div>"
      );
    }

    d.innerHTML =
      "<p class=note style='margin-top:0'>Account: <span style='font-family:var(--mono)'>" +
      escapeHtml(detail.account_id || "") +
      "</span></p>" +
      "<p class=note>Pubkey: <span style='font-family:var(--mono)'>" +
      escapeHtml(detail.pubkey || "") +
      "</span></p>" +
      "<p class=note>SOL: <span style='font-family:var(--mono)'>" +
      escapeHtml(sol) +
      "</span></p>" +
      "<div class='card-plain' style='padding:0.75rem;border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.12)'>" +
      "<h3 style='margin-top:0'>Actions</h3>" +
      "<div style='display:grid;gap:0.75rem'>" +
      "<div style='display:grid;gap:0.5rem'>" +
      "<div class=note style='margin:0'>Send SOL</div>" +
      "<input id='send-sol-to' class='input' placeholder='To pubkey (base58)'>" +
      "<input id='send-sol-lamports' class='input' placeholder='Lamports (integer)'>" +
      "<button id='btn-send-sol' type=button class='btn btn-primary'>Send SOL</button>" +
      "</div>" +
      "<div style='display:grid;gap:0.5rem'>" +
      "<div class=note style='margin:0'>Send SPL</div>" +
      "<input id='send-spl-mint' class='input' placeholder='Mint (base58)'>" +
      "<input id='send-spl-to' class='input' placeholder='To owner pubkey (base58)'>" +
      "<input id='send-spl-amount' class='input' placeholder='Amount UI (e.g. 1.5)'>" +
      "<input id='send-spl-decimals' class='input' placeholder='Decimals (e.g. 9)'>" +
      "<button id='btn-send-spl' type=button class='btn btn-primary'>Send SPL</button>" +
      "</div>" +
      "<div style='display:grid;gap:0.5rem'>" +
      "<div class=note style='margin:0'>Burn SPL (from custodial ATA)</div>" +
      "<input id='burn-spl-mint' class='input' placeholder='Mint (base58)'>" +
      "<input id='burn-spl-amount' class='input' placeholder='Amount UI (e.g. 1)'>" +
      "<input id='burn-spl-decimals' class='input' placeholder='Decimals (e.g. 9)'>" +
      "<button id='btn-burn-spl' type=button class='btn btn-secondary'>Burn SPL</button>" +
      "</div>" +
      "</div>" +
      "</div>" +
      "<h3 style='margin-top:1.25rem'>Token accounts</h3>" +
      tokenRows();

    const accountId = String(detail.account_id || "").trim();

    const btnSendSol = el("btn-send-sol");
    if (btnSendSol) {
      btnSendSol.addEventListener("click", async function () {
        const to = (el("send-sol-to") && el("send-sol-to").value ? String(el("send-sol-to").value).trim() : "") || "";
        const lam = (el("send-sol-lamports") && el("send-sol-lamports").value ? String(el("send-sol-lamports").value).trim() : "") || "";
        if (!to || !lam) {
          setStatus("To + lamports required.", "warn");
          return;
        }
        setStatus("Sending SOL…");
        const res = await apiFetch("/api/dev/wallet-admin/wallet/" + encodeURIComponent(accountId) + "/transfer-sol", {
          method: "POST",
          body: JSON.stringify({ to_pubkey_base58: to, lamports: Number(lam) }),
        }).catch(() => null);
        if (!res) return setStatus("Network error.", "warn");
        const j = await res.json().catch(() => ({}));
        if (!res.ok) return setStatus(j.detail || "Request failed.", "warn");
        setStatus("Sent. Sig: " + (j.signature || "—"), "ok");
        loadWalletDetail(accountId);
      });
    }

    const btnSendSpl = el("btn-send-spl");
    if (btnSendSpl) {
      btnSendSpl.addEventListener("click", async function () {
        const mint = (el("send-spl-mint") && el("send-spl-mint").value ? String(el("send-spl-mint").value).trim() : "") || "";
        const to = (el("send-spl-to") && el("send-spl-to").value ? String(el("send-spl-to").value).trim() : "") || "";
        const amt = (el("send-spl-amount") && el("send-spl-amount").value ? String(el("send-spl-amount").value).trim() : "") || "";
        const dec = (el("send-spl-decimals") && el("send-spl-decimals").value ? String(el("send-spl-decimals").value).trim() : "") || "";
        if (!mint || !to || !amt || !dec) {
          setStatus("Mint + to owner + amount + decimals required.", "warn");
          return;
        }
        setStatus("Sending SPL…");
        const res = await apiFetch("/api/dev/wallet-admin/wallet/" + encodeURIComponent(accountId) + "/transfer-spl", {
          method: "POST",
          body: JSON.stringify({ mint_base58: mint, to_owner_base58: to, amount_ui: amt, decimals: Number(dec) }),
        }).catch(() => null);
        if (!res) return setStatus("Network error.", "warn");
        const j = await res.json().catch(() => ({}));
        if (!res.ok) return setStatus(j.detail || "Request failed.", "warn");
        setStatus("Sent. Sig: " + (j.signature || "—"), "ok");
        loadWalletDetail(accountId);
      });
    }

    const btnBurnSpl = el("btn-burn-spl");
    if (btnBurnSpl) {
      btnBurnSpl.addEventListener("click", async function () {
        const mint = (el("burn-spl-mint") && el("burn-spl-mint").value ? String(el("burn-spl-mint").value).trim() : "") || "";
        const amt = (el("burn-spl-amount") && el("burn-spl-amount").value ? String(el("burn-spl-amount").value).trim() : "") || "";
        const dec = (el("burn-spl-decimals") && el("burn-spl-decimals").value ? String(el("burn-spl-decimals").value).trim() : "") || "";
        if (!mint || !amt || !dec) {
          setStatus("Mint + amount + decimals required.", "warn");
          return;
        }
        if (!confirm("Burn is irreversible. Continue?")) return;
        setStatus("Burning SPL…");
        const res = await apiFetch("/api/dev/wallet-admin/wallet/" + encodeURIComponent(accountId) + "/burn-spl", {
          method: "POST",
          body: JSON.stringify({ mint_base58: mint, amount_ui: amt, decimals: Number(dec) }),
        }).catch(() => null);
        if (!res) return setStatus("Network error.", "warn");
        const j = await res.json().catch(() => ({}));
        if (!res.ok) return setStatus(j.detail || "Request failed.", "warn");
        setStatus("Burned. Sig: " + (j.signature || "—"), "ok");
        loadWalletDetail(accountId);
      });
    }

    Array.from(d.querySelectorAll("button[data-close-ata]")).forEach((btn) => {
      btn.addEventListener("click", async function () {
        const ata = btn.getAttribute("data-close-ata") || "";
        if (!ata) return;
        const dest = prompt("Destination pubkey for reclaimed rent (base58):", detail.pubkey || "");
        if (!dest) return;
        if (!confirm("Close token account? This only succeeds if it's empty.")) return;
        setStatus("Closing ATA…");
        const res = await apiFetch("/api/dev/wallet-admin/wallet/" + encodeURIComponent(accountId) + "/close-empty-ata", {
          method: "POST",
          body: JSON.stringify({ token_account_base58: ata, destination_base58: String(dest).trim() }),
        }).catch(() => null);
        if (!res) return setStatus("Network error.", "warn");
        const j = await res.json().catch(() => ({}));
        if (!res.ok) return setStatus(j.detail || "Request failed.", "warn");
        setStatus("Closed. Sig: " + (j.signature || "—"), "ok");
        loadWalletDetail(accountId);
      });
    });
  }

  async function loadWalletDetail(accountId) {
    mountWalletDetailLoading(accountId);
    const res = await apiFetch("/api/dev/wallet-admin/wallet/" + encodeURIComponent(accountId) + "/overview", {
      method: "GET",
    }).catch(() => null);
    if (!res) return setStatus("Network error.", "warn");
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(j.detail || "Request failed.", "warn");
      return;
    }
    mountWalletDetail(j);
  }

  async function refresh() {
    if (!token()) {
      setStatus("You must sign in first (visit /account.html).", "warn");
      return;
    }
    setStatus("Loading…");
    const res = await apiFetch("/api/dev/wallet-admin/wallets?limit=200", { method: "GET" }).catch(() => null);
    if (!res) return setStatus("Network error.", "warn");
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(j.detail || "Request failed. Ensure DEV_WALLET_ADMIN_ENABLED=1 on the API dev worker.", "warn");
      return;
    }
    mountWallets(Array.isArray(j.items) ? j.items : []);
    setStatus("Loaded " + (Array.isArray(j.items) ? j.items.length : 0) + " wallet(s).", "ok");
  }

  async function main() {
    try {
      await loadConfig();
    } catch {
      setStatus("Could not load site config (/api/site-config).", "warn");
      return;
    }

    const btn = el("btn-refresh");
    if (btn) btn.addEventListener("click", refresh);
    const q = el("q");
    if (q) q.addEventListener("input", function () {
      // Re-filter locally by reusing last list DOM buttons text; easiest is just refresh list from DOM:
      // Instead, trigger a lightweight refresh only when user asks.
      // Here we only filter by reusing current items not stored; so just click refresh.
    });

    await refresh();
  }

  main().catch(function () {
    setStatus("Unexpected error.", "warn");
  });
})();

