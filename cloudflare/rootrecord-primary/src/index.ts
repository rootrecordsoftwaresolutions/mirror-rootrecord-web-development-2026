import { json } from "./cors";
import { logHttpRequestJson, persistHttpErrorIfNeeded, pruneWorkerHttpErrorEvents } from "./observability";
import type { Env } from "./router";
import { handleRequest } from "./router";
import { runInactiveAccountCleanupCron } from "./inactive-account-cron";
import { runNoaaAlertCron } from "./noaa-alert-cron";
import { runRrttCustodialPayoutCron } from "./solana-internal-wallet";

/** POST to `rootrecord-solana-tx` (not NOAA). `utcMinute` 0 = SOL LP; 10 = RRTT/RRESERVE + Discord. */
async function triggerTreasurySolanaTxWorker(env: Env, utcMinute: number): Promise<void> {
  const base = String(env.ROOTRECORD_SOLANA_TX_URL || "").trim().replace(/\/+$/, "");
  const secret = String(env.RR_PUSH_ADMIN_SECRET || "").trim();
  if (!base || !secret) return;
  const path =
    utcMinute === 0
      ? "/internal/run-treasury-sol-lp-check"
      : utcMinute === 10
        ? "/internal/run-treasury-liquidity-check"
        : "";
  if (!path) return;
  const url = `${base}/api${path}`;
  const cron = new Date().toISOString();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "X-RR-Push-Admin-Key": secret },
      signal: AbortSignal.timeout(120_000),
    });
    const text = await res.text();
    console.log(
      JSON.stringify({
        msg: "solana_tx_worker_trigger",
        path,
        status: res.status,
        body_snip: text.slice(0, 1200),
        at: cron,
      }),
    );
  } catch (e) {
    console.error(
      JSON.stringify({
        msg: "solana_tx_worker_trigger_err",
        path,
        at: cron,
        err: (e instanceof Error ? e.message : String(e)).slice(0, 500),
      }),
    );
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const t0 = Date.now();
    try {
      const res = await handleRequest(request, env);
      const ms = Date.now() - t0;
      logHttpRequestJson(request, res, ms);
      ctx.waitUntil(
        persistHttpErrorIfNeeded(env.DB, request, res, ms, null).catch((e) =>
          console.error("observability persist", String(e)),
        ),
      );
      return res;
    } catch (e) {
      const ms = Date.now() - t0;
      const detail = e instanceof Error ? e.message : String(e);
      console.error(
        JSON.stringify({
          msg: "http_request_uncaught",
          v: 1,
          method: request.method,
          path: new URL(request.url).pathname,
          ms,
          err: detail.slice(0, 800),
        }),
      );
      const res = json({ detail: "Internal Server Error" }, 500);
      ctx.waitUntil(
        persistHttpErrorIfNeeded(env.DB, request, res, ms, detail).catch(() => {}),
      );
      return res;
    }
  },
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const c = event.cron || "";
    if (c === "0 7 * * *") {
      const rrttStats = await runRrttCustodialPayoutCron(env);
      console.log("rrtt custodial scheduled cron stats", JSON.stringify(rrttStats));
      return;
    }
    if (c === "45 8 * * *") {
      await runInactiveAccountCleanupCron(env);
      await pruneWorkerHttpErrorEvents(env.DB).catch((e) => console.error("observability prune", String(e)));
      return;
    }
    await runNoaaAlertCron(env);
    if (c === "*/5 * * * *") {
      const utcMin = new Date(event.scheduledTime).getUTCMinutes();
      if (utcMin === 0) {
        ctx.waitUntil(
          triggerTreasurySolanaTxWorker(env, 0).catch((e) =>
            console.error("treasury_sol_cron_wait", e instanceof Error ? e.message : String(e)),
          ),
        );
      }
      if (utcMin === 10) {
        ctx.waitUntil(
          triggerTreasurySolanaTxWorker(env, 10).catch((e) =>
            console.error("treasury_liquidity_cron_wait", e instanceof Error ? e.message : String(e)),
          ),
        );
      }
    }
  },
};
