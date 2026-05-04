/**
 * Fire-and-forget: POST `/api/solana-site/token-discord-notify` on the same origin.
 * In production that route proxies to RootRecord primary (Bearer `SOLANA_SITE_LOG_SECRET`), which posts
 * to Discord using the Worker secret `DISCORD_TOKEN_CREATE_WEBHOOK_URL` — same pattern as `/api/solana-site/log`
 * and the forwarded `/api/tools/*` routes.
 */
export type DiscordTokenNotifyInput = {
  mint: string;
  signature: string;
  creator: string;
  name: string;
  symbol: string;
  uri?: string;
  network: string;
  token2022: boolean;
};

export function notifyDiscordTokenCreated(input: DiscordTokenNotifyInput): void {
  if (typeof window === 'undefined') return;
  const {
    mint,
    signature,
    creator,
    name,
    symbol,
    uri,
    network,
    token2022,
  } = input;
  if (!mint || !signature || !creator || !name || !symbol) return;

  try {
    void fetch('/api/solana-site/token-discord-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mint,
        signature,
        creator,
        name,
        symbol,
        uri: uri || undefined,
        network,
        token2022,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}
