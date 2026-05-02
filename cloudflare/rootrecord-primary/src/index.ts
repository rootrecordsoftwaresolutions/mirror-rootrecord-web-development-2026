import type { Env } from "./router";
import { handleRequest } from "./router";
import { runInactiveAccountCleanupCron } from "./inactive-account-cron";
import { runNoaaAlertCron } from "./noaa-alert-cron";
import { runRrttCustodialPayoutCron } from "./solana-internal-wallet";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    const c = event.cron || "";
    if (c === "0 7 * * *") {
      const rrttStats = await runRrttCustodialPayoutCron(env);
      console.log("rrtt custodial scheduled cron stats", JSON.stringify(rrttStats));
      return;
    }
    if (c === "45 8 * * *") {
      await runInactiveAccountCleanupCron(env);
      return;
    }
    await runNoaaAlertCron(env);
  },
};
