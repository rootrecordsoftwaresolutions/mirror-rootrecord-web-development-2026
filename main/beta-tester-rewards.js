(function () {
  const TOKEN_KEY = "rootrecord_portal_token";
  /** Same app_id as account.js — summary balance is account-wide. */
  const BETA_EARN_APP_ID = "rootrecord_weather_manager_android";

  function notifyPortalAuthChange() {
    try {
      window.dispatchEvent(new CustomEvent("rootrecord-portal-auth-change"));
    } catch {
      /* ignore */
    }
  }

  function el(id) {
    return document.getElementById(id);
  }

  function showPanel(name) {
    const map = { loading: "panel-rewards-loading", guest: "panel-rewards-guest", main: "panel-rewards-main" };
    const target = map[name] || map.loading;
    ["panel-rewards-loading", "panel-rewards-guest", "panel-rewards-main"].forEach((id) => {
      const n = el(id);
      if (n) n.hidden = id !== target;
    });
  }

  function setStatus(msg, kind) {
    const s = el("rewards-balance-status");
    if (!s) return;
    if (!msg) {
      s.textContent = "";
      s.hidden = true;
      s.className = "status";
      return;
    }
    s.textContent = msg;
    s.hidden = false;
    s.className = "status" + (kind ? " status-" + kind : "");
  }

  async function loadApiBase() {
    const res = await fetch("/api/site-config", { cache: "no-store" });
    if (!res.ok) throw new Error("config");
    const j = await res.json();
    return typeof j.apiBase === "string" ? j.apiBase.replace(/\/+$/, "") : "";
  }

  function formatBalance(n) {
    const b = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    return String(b.toLocaleString());
  }

  async function refreshRewardsBalance() {
    showPanel("loading");
    setStatus("");

    let apiBase;
    try {
      apiBase = await loadApiBase();
    } catch {
      showPanel("main");
      const bal = el("beta-rewards-balance-val");
      if (bal) bal.textContent = "—";
      setStatus("We could not load your balance. Please try again in a moment.", "warn");
      return;
    }

    if (!apiBase) {
      showPanel("main");
      const bal = el("beta-rewards-balance-val");
      if (bal) bal.textContent = "—";
      setStatus("Balance is not available on this copy of the site yet.", "warn");
      return;
    }

    const path = "/api/earn/summary?app_id=" + encodeURIComponent(BETA_EARN_APP_ID);
    const headers = new Headers();
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) headers.set("Authorization", "Bearer " + token);
    let res;
    try {
      res = await fetch(apiBase + path, {
        headers,
        credentials: "include",
        cache: "no-store",
      });
    } catch {
      showPanel("main");
      const bal = el("beta-rewards-balance-val");
      if (bal) bal.textContent = "—";
      setStatus("We could not load your balance. Please try again in a moment.", "warn");
      return;
    }

    if (res.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      notifyPortalAuthChange();
      showPanel("guest");
      setStatus("");
      return;
    }

    if (!res.ok) {
      showPanel("main");
      const bal = el("beta-rewards-balance-val");
      if (bal) bal.textContent = "—";
      setStatus("We could not load your balance. Please try again in a moment.", "warn");
      return;
    }

    let j;
    try {
      j = await res.json();
    } catch {
      showPanel("main");
      const bal = el("beta-rewards-balance-val");
      if (bal) bal.textContent = "—";
      setStatus("We could not load your balance. Please try again in a moment.", "warn");
      return;
    }

    const n = j && typeof j === "object" ? Number(j.balance) : NaN;
    const bal = el("beta-rewards-balance-val");
    if (bal) {
      bal.textContent = Number.isFinite(n) ? formatBalance(n) : "—";
    }
    showPanel("main");
    if (!Number.isFinite(n)) {
      setStatus("Balance could not be read. Please try again in a moment.", "warn");
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    refreshRewardsBalance();
    window.addEventListener("storage", (e) => {
      if (e.key === TOKEN_KEY) refreshRewardsBalance();
    });
    window.addEventListener("rootrecord-portal-auth-change", refreshRewardsBalance);
  });
})();
