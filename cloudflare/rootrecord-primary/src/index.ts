import type { Env } from "./router";
import { handleRequest } from "./router";
import { runNoaaAlertCron } from "./noaa-alert-cron";
import { runRrttCustodialPayoutCron } from "./solana-internal-wallet";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    const c = event.cron || "";
    if (c === "0 7 * * *") {
      await runRrttCustodialPayoutCron(env);
      return;
    }
    await runNoaaAlertCron(env);
  },
};
