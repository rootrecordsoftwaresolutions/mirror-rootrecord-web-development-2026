/**
 * Pulls new posts from a Discord text channel into `developer_messages` (mobile Settings feed).
 *
 * Setup:
 * 1. Discord Developer Portal → Application → Bot → reset token → `wrangler secret put DISCORD_BOT_TOKEN`
 * 2. Enable **Privileged Message Content Intent** (Bot tab) so the API returns `content` in guild channels.
 * 3. Invite bot to your server with **Read Messages/View Channel** + **Read Message History** on the announcements channel.
 * 4. Set `DISCORD_ANNOUNCEMENTS_CHANNEL_ID` in wrangler.toml [vars] (right-click channel → Copy ID with Dev Mode on).
 *
 * Cron: every 15 minutes (see wrangler.toml triggers) calls `runDiscordDeveloperMessageSync`.
 */

import type { D1Database } from "@cloudflare/workers-types";

export interface DiscordDeveloperSyncEnv {
  DB: D1Database;
  DISCORD_ANNOUNCEMENTS_CHANNEL_ID?: string;
  DISCORD_BOT_TOKEN?: string;
}

interface DiscordAuthor {
  id?: string;
  username?: string;
  global_name?: string | null;
  bot?: boolean;
}

interface DiscordMessage {
  id: string;
  type?: number;
  content?: string;
  timestamp?: string;
  author?: DiscordAuthor;
}

function displayAuthor(a: DiscordAuthor | undefined): string {
  if (!a) return "Team";
  const g = (a.global_name || "").trim();
  if (g) return g.slice(0, 80);
  const u = (a.username || "").trim();
  return u ? u.slice(0, 80) : "Team";
}

function isoFromDiscord(ts: string | undefined): string {
  if (!ts) return new Date().toISOString();
  try {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

export async function runDiscordDeveloperMessageSync(env: DiscordDeveloperSyncEnv): Promise<{
  ok: boolean;
  inserted: number;
  skipped: string;
}> {
  const token = String(env.DISCORD_BOT_TOKEN || "").trim();
  const channelId = String(env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID || "").trim();
  if (!token || !channelId) {
    return { ok: true, inserted: 0, skipped: "discord_not_configured" };
  }

  const res = await fetch(`https://discord.com/api/v10/channels/${encodeURIComponent(channelId)}/messages?limit=25`, {
    headers: {
      Authorization: `Bot ${token}`,
      "User-Agent": "RootRecordPrimaryWorker (discord sync; contact: root@rootrecord.info)",
    },
  });

  if (!res.ok) {
    const snippet = (await res.text()).slice(0, 400);
    console.error(
      JSON.stringify({ msg: "discord_developer_sync_http", status: res.status, channel_id: channelId, snippet }),
    );
    return { ok: false, inserted: 0, skipped: `discord_http_${res.status}` };
  }

  let messages: DiscordMessage[];
  try {
    messages = (await res.json()) as DiscordMessage[];
  } catch {
    return { ok: false, inserted: 0, skipped: "discord_json_parse" };
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: true, inserted: 0, skipped: "no_messages" };
  }

  /** Discord returns newest-first; insert oldest-first so ordering feels natural. */
  const ordered = [...messages].reverse();
  let inserted = 0;

  for (const m of ordered) {
    if (!m?.id) continue;
    // Default message type 0; skip system / calls / etc.
    if (m.type != null && m.type !== 0) continue;
    const content = String(m.content || "").trim();
    if (!content) continue;
    if (m.author?.bot) continue;

    const rowId = `discord:${m.id}`;
    const title = `Discord · ${displayAuthor(m.author)}`;
    const body = content.slice(0, 8000);
    const created_at = isoFromDiscord(m.timestamp);

    try {
      const r = await env.DB.prepare(
        `INSERT OR IGNORE INTO developer_messages (id, title, body, app_scope, created_at) VALUES (?, ?, ?, 'all', ?)`
      )
        .bind(rowId, title.slice(0, 200), body, created_at)
        .run();
      if (r.meta?.changes === 1) inserted += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(JSON.stringify({ msg: "discord_developer_sync_insert_err", err: msg.slice(0, 200), rowId }));
    }
  }

  if (inserted > 0) {
    console.log(JSON.stringify({ msg: "discord_developer_sync_ok", inserted, channel_id: channelId }));
  }
  return { ok: true, inserted, skipped: "ok" };
}
