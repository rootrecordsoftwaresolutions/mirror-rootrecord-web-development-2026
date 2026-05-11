(function () {
  const TOKEN_KEY = "rootrecord_portal_token";
  const LIFETIME_NAV_KEY = "rootrecord_portal_lifetime_nav";
  /** Set when /v1/me succeeds with HttpOnly cookie (no localStorage JWT). Cleared on auth-change. */
  const WEB_AUTH_HINT = "data-rootrecord-web-auth";

  function clearWebSessionHint() {
    document.documentElement.removeAttribute(WEB_AUTH_HINT);
  }

  function navSignedInFromStorage() {
    return !!localStorage.getItem(TOKEN_KEY) || document.documentElement.getAttribute(WEB_AUTH_HINT) === "1";
  }

  function syncNavSignedIn() {
    document.documentElement.classList.toggle("nav-signed-in", navSignedInFromStorage());
  }

  function syncLifetimeNav() {
    const signedIn = navSignedInFromStorage();
    const lifetime = signedIn && localStorage.getItem(LIFETIME_NAV_KEY) === "1";
    document.documentElement.classList.toggle("nav-lifetime", lifetime);
  }

  async function probeWebSession() {
    if (localStorage.getItem(TOKEN_KEY)) return;
    try {
      const res = await fetch("/v1/me", { method: "GET", credentials: "include", cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      const email = data && typeof data === "object" ? String(data.email || "").trim() : "";
      if (!email) return;
      document.documentElement.setAttribute(WEB_AUTH_HINT, "1");
      if (data.life_member || data.lifeMember) {
        localStorage.setItem(LIFETIME_NAV_KEY, "1");
      } else {
        localStorage.removeItem(LIFETIME_NAV_KEY);
      }
    } catch {
      /* ignore */
    }
  }

  function closeAccountPanel() {
    const btn = document.querySelector(".nav-account-trigger");
    const panel = document.getElementById("nav-account-panel");
    if (btn) btn.setAttribute("aria-expanded", "false");
    if (panel) panel.hidden = true;
  }

  function openAccountPanel() {
    const btn = document.querySelector(".nav-account-trigger");
    const panel = document.getElementById("nav-account-panel");
    if (btn) btn.setAttribute("aria-expanded", "true");
    if (panel) panel.hidden = false;
  }

  function toggleAccountPanel() {
    const panel = document.getElementById("nav-account-panel");
    if (!panel) return;
    if (panel.hidden === false) closeAccountPanel();
    else openAccountPanel();
  }

  function ensureFooterTesterRewardsLink() {
    const footer = document.querySelector(".site-footer");
    if (!footer) return;

    // Avoid duplicates if any page already includes it.
    const existing = footer.querySelector('a[href="/beta-tester-rewards.html"], a[href="https://rootrecord.info/beta-tester-rewards"], a[href="https://rootrecord.info/beta-tester-rewards.html"]');
    if (existing) return;

    const cols = Array.from(footer.querySelectorAll(".footer-col"));
    const companyCol = cols.find((c) => (c.querySelector("h4")?.textContent || "").trim() === "Company");
    const ul = companyCol?.querySelector("ul");
    if (!ul) return;

    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = "/beta-tester-rewards.html";
    a.textContent = "Earn Rewards";
    li.appendChild(a);
    ul.appendChild(li);
  }

  window.addEventListener("DOMContentLoaded", () => {
    syncNavSignedIn();
    syncLifetimeNav();
    ensureFooterTesterRewardsLink();
    void probeWebSession().then(() => {
      syncNavSignedIn();
      syncLifetimeNav();
    });

    window.addEventListener("storage", (e) => {
      if (e.key === TOKEN_KEY) {
        syncNavSignedIn();
        syncLifetimeNav();
      }
      if (e.key === LIFETIME_NAV_KEY) syncLifetimeNav();
    });
    window.addEventListener("rootrecord-portal-auth-change", () => {
      clearWebSessionHint();
      syncNavSignedIn();
      syncLifetimeNav();
      void probeWebSession().then(() => {
        syncNavSignedIn();
        syncLifetimeNav();
      });
    });
    window.addEventListener("rootrecord-portal-lifetime-nav-change", syncLifetimeNav);

    const trigger = document.querySelector(".nav-account-trigger");
    const panel = document.getElementById("nav-account-panel");
    if (!trigger || !panel) return;

    trigger.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      toggleAccountPanel();
    });
    panel.querySelectorAll('a[role="menuitem"]').forEach((a) => {
      a.addEventListener("click", () => closeAccountPanel());
    });
    document.addEventListener("click", (ev) => {
      if (!trigger.contains(ev.target) && !panel.contains(ev.target)) closeAccountPanel();
    });
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") closeAccountPanel();
    });
  });
})();
