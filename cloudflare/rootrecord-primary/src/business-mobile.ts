/**
 * RootRecord Business Manager — mobile data on primary Worker (D1 `bm_owned_row`).
 * Auth + earn stay shared with Weather; rows are keyed by the same `user:email` as rr_earn_*.
 */
import type { D1Database } from "@cloudflare/workers-types";
import { json } from "./cors";
import { sessionFromBearer, type AuthEnv } from "./primary-auth";
import { fetchBillingSnapshot } from "../../shared/billing-state";
import { readUserAccountAccessFlags } from "./accounts";

export type BusinessEnv = AuthEnv;

const BM_ROOTS = new Set([
  "categories",
  "projects",
  "quick-actions",
  "time",
  "money",
  "clients",
  "invoices",
  "products",
  "supplies",
  "schedule",
  "debts",
  "scheduled-expenses",
  "resources",
  "funds",
  "businesses",
  "settings",
  "feedback",
  "dashboard",
]);

const DEFAULT_CATEGORIES = [
  { name: "Coding", color: "#2B8A8F", kind: "time" },
  { name: "Development", color: "#06B6D4", kind: "time" },
  { name: "Marketing", color: "#F59E0B", kind: "time" },
  { name: "Research", color: "#6366F1", kind: "time" },
  { name: "Evaluation", color: "#8B5CF6", kind: "time" },
  { name: "Design", color: "#EC4899", kind: "time" },
  { name: "Testing", color: "#A855F7", kind: "time" },
  { name: "Admin", color: "#F43F5E", kind: "time" },
  { name: "Analytics", color: "#10B981", kind: "time" },
  { name: "Operations", color: "#EAB308", kind: "time" },
  { name: "Meetings", color: "#14B8A6", kind: "time" },
  { name: "Break", color: "#687777", kind: "time" },
];

function nowIso(): string {
  return new Date().toISOString().replace("+00:00", "Z");
}

function newId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function partsFromSub(sub: string): string[] {
  return sub.replace(/^\/+/, "").split("/").filter(Boolean);
}

async function requireUserKey(request: Request, env: BusinessEnv): Promise<string | Response> {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return json({ detail: "Missing token" }, 401);
  }
  const token = auth.slice(7).trim();
  const sess = await sessionFromBearer(env, token);
  if (!sess) return json({ detail: "Invalid or expired session." }, 401);
  return `user:${sess.email.toLowerCase()}`;
}

async function rowGet(db: D1Database, userKey: string, coll: string, id: string): Promise<Record<string, unknown> | null> {
  const r = await db
    .prepare("SELECT doc FROM bm_owned_row WHERE user_key = ? AND coll = ? AND id = ?")
    .bind(userKey, coll, id)
    .first<{ doc: string }>();
  if (!r?.doc) return null;
  try {
    return JSON.parse(r.doc) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function rowPut(db: D1Database, userKey: string, coll: string, id: string, doc: Record<string, unknown>) {
  const now = nowIso();
  const prev = await rowGet(db, userKey, coll, id);
  const created = (prev?.created_at as string) || now;
  const merged = { ...doc, id, user_key: userKey, created_at: created, updated_at: now };
  const j = JSON.stringify(merged);
  await db
    .prepare(
      `INSERT INTO bm_owned_row (user_key, coll, id, doc, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_key, coll, id) DO UPDATE SET doc = excluded.doc, updated_at = excluded.updated_at`
    )
    .bind(userKey, coll, id, j, created, now)
    .run();
  return merged;
}

async function rowDelete(db: D1Database, userKey: string, coll: string, id: string) {
  await db.prepare("DELETE FROM bm_owned_row WHERE user_key = ? AND coll = ? AND id = ?").bind(userKey, coll, id).run();
}

async function listColl(
  db: D1Database,
  userKey: string,
  coll: string,
  sort: "updated" | "name" | "start" = "updated"
): Promise<Record<string, unknown>[]> {
  const r = await db
    .prepare("SELECT doc FROM bm_owned_row WHERE user_key = ? AND coll = ?")
    .bind(userKey, coll)
    .all<{ doc: string }>();
  const rows = (r.results || [])
    .map((x) => {
      try {
        return JSON.parse(x.doc) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as Record<string, unknown>[];
  if (sort === "name") {
    rows.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  } else if (sort === "start") {
    rows.sort((a, b) => String(b.start_utc || "").localeCompare(String(a.start_utc || "")));
  } else {
    rows.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  }
  return rows;
}

async function ensureSeed(db: D1Database, userKey: string) {
  const n = await db
    .prepare("SELECT COUNT(1) AS c FROM bm_owned_row WHERE user_key = ? AND coll = 'categories'")
    .bind(userKey)
    .first<{ c: number }>();
  if ((n?.c || 0) > 0) return;
  const t = nowIso();
  const bizId = newId();
  await rowPut(db, userKey, "businesses", bizId, {
    id: bizId,
    user_id: userKey,
    name: "My Business",
    legal_name: "",
    owner: "",
    tax_id: "",
    email: "",
    phone: "",
    website: "",
    address: "",
    timezone: "system",
    invoice_notes: "",
    is_default: true,
    created_at: t,
    updated_at: t,
  });
  let i = 0;
  for (const c of DEFAULT_CATEGORIES) {
    const id = newId();
    await rowPut(db, userKey, "categories", id, {
      ...c,
      id,
      user_id: userKey,
      billable: 1,
      default_hourly_cents: null,
      sort_order: i++,
      archived: 0,
      icon: "",
      created_at: t,
      updated_at: t,
    });
  }
  const cats = await listColl(db, userKey, "categories", "name");
  const byName: Record<string, string> = {};
  for (const c of cats) byName[String(c.name)] = String(c.id);
  const seeds = [
    { label: "Code", category_name: "Coding", default_description: "Development work", icon: "Code" },
    { label: "Meeting", category_name: "Meetings", default_description: "Team / client meeting", icon: "Users" },
    { label: "Review", category_name: "Coding", default_description: "Code review and feedback", icon: "FileSearch" },
  ];
  let q = 0;
  for (const s of seeds) {
    const id = newId();
    await rowPut(db, userKey, "quick_actions", id, {
      id,
      user_id: userKey,
      label: s.label,
      category_id: byName[s.category_name] || null,
      project_id: null,
      default_description: s.default_description,
      icon: s.icon,
      sort_order: q++,
      created_at: t,
      updated_at: t,
    });
  }
  await rowPut(db, userKey, "settings", "default", {
    user_id: userKey,
    currency_default: "USD",
    theme: "dark",
    prompt_interval_sec: 900,
    prompt_first_delay_sec: 120,
    prompt_response_timeout_sec: 45,
    default_hourly_cents: 0,
    show_money_in_dashboard: true,
    help_bubbles_enabled: true,
    business_timezone: "system",
    active_business_id: null,
    updated_at: t,
  });
}

export async function handleBusinessAuthEntitlement(request: Request, env: BusinessEnv): Promise<Response> {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return json({ detail: "Missing token" }, 401);
  const token = auth.slice(7).trim();
  const sess = await sessionFromBearer(env, token);
  if (!sess) return json({ detail: "Unauthorized" }, 401);
  const billing = await fetchBillingSnapshot(env.DB, sess.email);
  const acct = await readUserAccountAccessFlags(env.DB, sess.email);
  const pro = Boolean(billing?.pro_unlocked) || Boolean(acct?.pro_unlocked);
  const life = Boolean(billing?.life_member) || Boolean(acct?.life_member);
  const subscription_status = billing ? billing.subscription_status : "none";
  const plan = pro || life ? "pro" : "free";
  return json(
    {
      ok: true,
      plan,
      access: { tier: pro ? "pro" : "none", reason: pro ? "paid" : "none" },
      reason: pro ? "paid" : "none",
      valid_until: null,
      subscription_status,
    },
    200
  );
}

function invoiceTotals(data: Record<string, unknown>) {
  const raw = data.lines;
  const lines = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
  let subtotal = 0;
  for (const line of lines) {
    const q = Number(line.quantity ?? 1) || 1;
    const p = Number(line.unit_price_cents ?? 0) || 0;
    subtotal += Math.floor(q * p);
  }
  const tax = Number(data.tax_cents ?? 0) || 0;
  return { subtotal_cents: subtotal, tax_cents: tax, total_cents: subtotal + tax };
}

export async function handleBusinessRoutes(
  request: Request,
  env: BusinessEnv,
  sub: string,
  method: string
): Promise<Response | null> {
  const parts = partsFromSub(sub);
  if (!parts.length) return null;
  if (!BM_ROOTS.has(parts[0]!) && parts[0] !== "money") return null;
  if (parts[0] === "money" && parts.length > 1 && !["income", "expenses"].includes(parts[1]!)) return null;

  const u = await requireUserKey(request, env);
  if (u instanceof Response) return u;
  const userKey = u;
  const db = env.DB;

  try {
    await ensureSeed(db, userKey);
  } catch (e) {
    console.error("bm seed", e);
  }

  try {
    // ---- categories
    if (parts[0] === "categories") {
      if (method === "GET" && parts.length === 1) {
        return json(await listColl(db, userKey, "categories", "name"), 200);
      }
      if (method === "POST" && parts.length === 1) {
        const body = (await request.json()) as Record<string, unknown>;
        const id = newId();
        const doc = await rowPut(db, userKey, "categories", id, {
          ...body,
          id,
          user_id: userKey,
          created_at: nowIso(),
          updated_at: nowIso(),
        });
        return json(doc, 200);
      }
      if (method === "PATCH" && parts.length === 2) {
        const prev = await rowGet(db, userKey, "categories", parts[1]!);
        if (!prev) return json({ detail: "categories not found" }, 404);
        const body = (await request.json()) as Record<string, unknown>;
        const doc = await rowPut(db, userKey, "categories", parts[1]!, { ...prev, ...body, id: parts[1] });
        return json(doc, 200);
      }
      if (method === "DELETE" && parts.length === 2) {
        await rowDelete(db, userKey, "categories", parts[1]!);
        return json({ ok: true }, 200);
      }
    }

    // ---- projects
    if (parts[0] === "projects") {
      if (method === "GET" && parts.length === 1) return json(await listColl(db, userKey, "projects"), 200);
      if (method === "POST" && parts.length === 1) {
        const body = (await request.json()) as Record<string, unknown>;
        const id = newId();
        return json(await rowPut(db, userKey, "projects", id, { ...body, id, user_id: userKey }), 200);
      }
      if (method === "DELETE" && parts.length === 2) {
        await rowDelete(db, userKey, "projects", parts[1]!);
        return json({ ok: true }, 200);
      }
    }

    // ---- quick actions
    if (parts[0] === "quick-actions") {
      if (method === "GET" && parts.length === 1) {
        const rows = await listColl(db, userKey, "quick_actions", "updated");
        rows.sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
        return json(rows, 200);
      }
      if (method === "POST" && parts.length === 1) {
        const body = (await request.json()) as Record<string, unknown>;
        const id = newId();
        return json(await rowPut(db, userKey, "quick_actions", id, { ...body, id, user_id: userKey }), 200);
      }
      if (method === "PATCH" && parts.length === 2) {
        const prev = await rowGet(db, userKey, "quick_actions", parts[1]!);
        if (!prev) return json({ detail: "not found" }, 404);
        const body = (await request.json()) as Record<string, unknown>;
        return json(await rowPut(db, userKey, "quick_actions", parts[1]!, { ...prev, ...body, id: parts[1] }), 200);
      }
      if (method === "DELETE" && parts.length === 2) {
        await rowDelete(db, userKey, "quick_actions", parts[1]!);
        return json({ ok: true }, 200);
      }
      if (method === "POST" && parts.length === 3 && parts[2] === "run") {
        const qa = await rowGet(db, userKey, "quick_actions", parts[1]!);
        if (!qa) return json({ detail: "Quick action not found" }, 404);
        const active = await rowGet(db, userKey, "active_session", "_");
        if (active?.active) return json({ detail: "Already clocked in" }, 409);
        const t = nowIso();
        const s = {
          user_id: userKey,
          active: true,
          category_id: qa.category_id ?? null,
          project_id: qa.project_id ?? null,
          description: String(qa.default_description || ""),
          started_at_utc: t,
          started_via_quick_action_id: qa.id,
        };
        await rowPut(db, userKey, "active_session", "_", s as unknown as Record<string, unknown>);
        return json(s, 200);
      }
    }

    // ---- time
    if (parts[0] === "time") {
      if (method === "GET" && parts[1] === "session") {
        const s = await rowGet(db, userKey, "active_session", "_");
        return json(s && s.active ? s : { active: false }, 200);
      }
      if (method === "POST" && parts[1] === "clock-in") {
        const active = await rowGet(db, userKey, "active_session", "_");
        if (active?.active) return json({ detail: "Already clocked in" }, 409);
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const t = nowIso();
        const s = {
          user_id: userKey,
          active: true,
          category_id: body.category_id ?? null,
          project_id: body.project_id ?? null,
          description: String(body.description || ""),
          started_at_utc: t,
        };
        await rowPut(db, userKey, "active_session", "_", s as Record<string, unknown>);
        return json(s, 200);
      }
      if (method === "POST" && parts[1] === "clock-out") {
        const s = await rowGet(db, userKey, "active_session", "_");
        if (!s?.active) return json({ detail: "No active session" }, 404);
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const end = nowIso();
        const entry = {
          id: newId(),
          user_id: userKey,
          start_utc: s.started_at_utc,
          end_utc: end,
          category_id: s.category_id ?? null,
          project_id: s.project_id ?? null,
          description: String(body.description || s.description || ""),
          source: "clock",
          created_at: end,
          updated_at: end,
        };
        await rowPut(db, userKey, "time_entries", entry.id, entry);
        await rowDelete(db, userKey, "active_session", "_");
        return json(entry, 200);
      }
      if (method === "POST" && parts[1] === "manual") {
        const body = (await request.json()) as Record<string, unknown>;
        const id = newId();
        const doc = {
          ...body,
          id,
          user_id: userKey,
          source: "manual",
          created_at: nowIso(),
          updated_at: nowIso(),
        };
        return json(await rowPut(db, userKey, "time_entries", id, doc), 200);
      }
      if (method === "GET" && parts[1] === "entries") {
        const url = new URL(request.url);
        const start = url.searchParams.get("start") || "";
        const end = url.searchParams.get("end") || "";
        const qf = (url.searchParams.get("q") || "").toLowerCase();
        const cat = url.searchParams.get("category_id") || "";
        let rows = await listColl(db, userKey, "time_entries", "start");
        if (start) rows = rows.filter((r) => String(r.start_utc || "") >= start);
        if (end) rows = rows.filter((r) => String(r.start_utc || "") <= end);
        if (cat) rows = rows.filter((r) => String(r.category_id || "") === cat);
        if (qf) rows = rows.filter((r) => String(r.description || "").toLowerCase().includes(qf));
        return json(rows.slice(0, 500), 200);
      }
      if (method === "DELETE" && parts[1] === "entries" && parts[2]) {
        await rowDelete(db, userKey, "time_entries", parts[2]!);
        return json({ ok: true }, 200);
      }
      if (method === "PATCH" && parts[1] === "entries" && parts[2]) {
        const prev = await rowGet(db, userKey, "time_entries", parts[2]!);
        if (!prev) return json({ detail: "not found" }, 404);
        const body = (await request.json()) as Record<string, unknown>;
        return json(await rowPut(db, userKey, "time_entries", parts[2]!, { ...prev, ...body, id: parts[2] }), 200);
      }
    }

    // ---- money
    if (parts[0] === "money" && parts[1] === "income") {
      const coll = "income_entries";
      if (method === "GET" && parts.length === 2) return json(await listColl(db, userKey, coll), 200);
      if (method === "POST" && parts.length === 2) {
        const body = (await request.json()) as Record<string, unknown>;
        if (!body.received_at_utc) body.received_at_utc = nowIso();
        const id = newId();
        return json(await rowPut(db, userKey, coll, id, { ...body, id, user_id: userKey }), 200);
      }
      if (method === "DELETE" && parts.length === 3) {
        await rowDelete(db, userKey, coll, parts[2]!);
        return json({ ok: true }, 200);
      }
    }
    if (parts[0] === "money" && parts[1] === "expenses") {
      const coll = "expense_entries";
      if (method === "GET" && parts.length === 2) return json(await listColl(db, userKey, coll), 200);
      if (method === "POST" && parts.length === 2) {
        const body = (await request.json()) as Record<string, unknown>;
        if (!body.spent_at_utc) body.spent_at_utc = nowIso();
        const id = newId();
        return json(await rowPut(db, userKey, coll, id, { ...body, id, user_id: userKey }), 200);
      }
      if (method === "DELETE" && parts.length === 3) {
        await rowDelete(db, userKey, coll, parts[2]!);
        return json({ ok: true }, 200);
      }
    }

    // ---- generic owned: clients, invoices, products, supplies, schedule_events, debts, scheduled_expenses, resources, funds, businesses, feedback
    const genericMap: Record<string, string> = {
      clients: "clients",
      invoices: "invoices",
      products: "products",
      supplies: "supplies",
      schedule: "schedule_events",
      debts: "debts",
      "scheduled-expenses": "scheduled_expenses",
      resources: "resources",
      funds: "funds",
      businesses: "businesses",
      feedback: "feedback",
    };
    const g0 = parts[0]!;
    if (genericMap[g0]) {
      const coll = genericMap[g0]!;
      if (method === "GET" && parts.length === 1) return json(await listColl(db, userKey, coll), 200);
      if (method === "POST" && parts.length === 1) {
        const body = (await request.json()) as Record<string, unknown>;
        const id = newId();
        if (coll === "invoices") {
          const t = invoiceTotals({ ...body, lines: body.lines || [] });
          Object.assign(body, t);
          if (!body.issued_at_utc) body.issued_at_utc = nowIso();
        }
        return json(await rowPut(db, userKey, coll, id, { ...body, id, user_id: userKey }), 200);
      }
      if (method === "PATCH" && parts.length === 2) {
        const prev = await rowGet(db, userKey, coll, parts[1]!);
        if (!prev) return json({ detail: "not found" }, 404);
        const body = (await request.json()) as Record<string, unknown>;
        const next = { ...prev, ...body, id: parts[1] };
        if (coll === "invoices") Object.assign(next, invoiceTotals(next));
        return json(await rowPut(db, userKey, coll, parts[1]!, next), 200);
      }
      if (method === "DELETE" && parts.length === 2) {
        await rowDelete(db, userKey, coll, parts[1]!);
        return json({ ok: true }, 200);
      }
    }

    // ---- settings singleton
    if (parts[0] === "settings") {
      if (method === "GET" && parts.length === 1) {
        const s = await rowGet(db, userKey, "settings", "default");
        return json(s || {}, 200);
      }
      if (method === "PATCH" && parts.length === 1) {
        const prev = (await rowGet(db, userKey, "settings", "default")) || { user_id: userKey };
        const body = (await request.json()) as Record<string, unknown>;
        return json(await rowPut(db, userKey, "settings", "default", { ...prev, ...body }), 200);
      }
    }

    // ---- dashboard summary
    if (parts[0] === "dashboard" && parts[1] === "summary" && method === "GET") {
      const url = new URL(request.url);
      const start =
        url.searchParams.get("start") ||
        new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1, 0, 0, 0)).toISOString().replace("+00:00", "Z");
      const end = url.searchParams.get("end") || nowIso();
      const entries = await listColl(db, userKey, "time_entries", "start");
      const cats = await listColl(db, userKey, "categories", "name");
      const catMap = new Map(cats.map((c) => [String(c.id), c]));
      const byCat: Record<string, number> = {};
      let totalSeconds = 0;
      for (const e of entries) {
        if (String(e.start_utc || "") < start || String(e.start_utc || "") > end) continue;
        try {
          const s = Date.parse(String(e.start_utc));
          const f = Date.parse(String(e.end_utc));
          const secs = Math.max(0, Math.floor((f - s) / 1000));
          totalSeconds += secs;
          const key = String(e.category_id || "uncategorized");
          byCat[key] = (byCat[key] || 0) + secs;
        } catch {
          /* skip */
        }
      }
      const breakdown = Object.entries(byCat).map(([cid, secs]) => {
        const c = catMap.get(cid);
        return {
          category_id: cid,
          name: c ? String(c.name) : "Uncategorized",
          color: c ? String(c.color) : "#687777",
          hours: Math.round((secs / 3600) * 100) / 100,
        };
      });
      breakdown.sort((a, b) => b.hours - a.hours);
      let incTotal = 0;
      for (const d of await listColl(db, userKey, "income_entries")) {
        if (String(d.received_at_utc || "") >= start && String(d.received_at_utc || "") <= end) {
          incTotal += Math.floor(Number(d.amount_cents) || 0);
        }
      }
      let expTotal = 0;
      for (const d of await listColl(db, userKey, "expense_entries")) {
        if (String(d.spent_at_utc || "") >= start && String(d.spent_at_utc || "") <= end) {
          expTotal += Math.floor(Number(d.amount_cents) || 0);
        }
      }
      return json(
        {
          start,
          end,
          hours: Math.round((totalSeconds / 3600) * 100) / 100,
          income_cents: incTotal,
          expense_cents: expTotal,
          net_cents: incTotal - expTotal,
          breakdown,
        },
        200
      );
    }

    return json({ detail: "Not Found" }, 404);
  } catch (e) {
    const msg = String(e && typeof e === "object" && "message" in e ? (e as Error).message : e);
    console.error("business-mobile", msg);
    return json({ detail: "Server error" }, 500);
  }
}
