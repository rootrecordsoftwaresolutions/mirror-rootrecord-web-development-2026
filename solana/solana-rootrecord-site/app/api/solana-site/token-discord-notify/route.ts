import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';

/**
 * Production: same pipeline as `/api/solana-site/log` — proxy to RootRecord primary Worker
 * (`SOLANA_SITE_LOG_URL` + `SOLANA_SITE_LOG_SECRET`). Worker posts to `DISCORD_TOKEN_CREATE_WEBHOOK_URL`.
 *
 * Local / preview without Worker: optional `DISCORD_TOKEN_CREATE_WEBHOOK_URL` on this host only.
 */
const MAX_NAME = 64;
const MAX_SYM = 16;
const MAX_URI = 512;
const MAX_SIG = 128;
const MAX_NET = 32;

function solscanTx(sig: string, network: string): string {
  const q =
    network === 'mainnet-beta' || !network
      ? ''
      : `?cluster=${encodeURIComponent(network)}`;
  return `https://solscan.io/tx/${sig}${q}`;
}

function solscanToken(mint: string, network: string): string {
  const q =
    network === 'mainnet-beta' || !network
      ? ''
      : `?cluster=${encodeURIComponent(network)}`;
  return `https://solscan.io/token/${mint}${q}`;
}

function validNetwork(n: string): boolean {
  return (
    n === 'mainnet-beta' ||
    n === 'devnet' ||
    n === 'testnet' ||
    n === 'localnet'
  );
}

function tokenNotifyUpstreamUrl(logUrl: string): string {
  return logUrl.replace(/\/log\/?$/i, '/token-discord-notify');
}

async function postDiscordFromBody(
  webhook: string,
  b: Record<string, unknown>
): Promise<Response> {
  const mint = String(b.mint || '').trim();
  const creator = String(b.creator || '').trim();
  const signature = String(b.signature || '').trim().slice(0, MAX_SIG);
  const name = String(b.name || '').trim().slice(0, MAX_NAME);
  const symbol = String(b.symbol || '').trim().slice(0, MAX_SYM);
  const uri =
    b.uri != null ? String(b.uri).trim().slice(0, MAX_URI) : '';
  const network = String(b.network || 'mainnet-beta')
    .trim()
    .slice(0, MAX_NET);
  const token2022 = Boolean(b.token2022);

  const programLabel = token2022 ? 'Token-2022' : 'SPL (legacy)';
  const descLines = [
    `**${symbol}** — ${name}`,
    '',
    `Mint: \`${mint}\``,
    `Creator: \`${creator}\``,
    `Program: ${programLabel}`,
    '',
    `[Solscan token](${solscanToken(mint, network)}) · [Create tx](${solscanTx(signature, network)})`,
  ];
  if (uri) {
    descLines.push('', `Metadata URI: ${uri.length > 200 ? `${uri.slice(0, 200)}…` : uri}`);
  }

  const embed = {
    title: 'New token created',
    description: descLines.join('\n').slice(0, 4000),
    color: 0xd946ef,
    timestamp: new Date().toISOString(),
  };

  return fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] }),
  });
}

export async function POST(req: Request) {
  const logUrl = process.env.SOLANA_SITE_LOG_URL?.trim();
  const secret = process.env.SOLANA_SITE_LOG_SECRET?.trim();

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const mint = String(parsed.mint || '').trim();
  const creator = String(parsed.creator || '').trim();
  const signature = String(parsed.signature || '').trim().slice(0, MAX_SIG);
  const name = String(parsed.name || '').trim().slice(0, MAX_NAME);
  const symbol = String(parsed.symbol || '').trim().slice(0, MAX_SYM);
  const network = String(parsed.network || 'mainnet-beta')
    .trim()
    .slice(0, MAX_NET);

  if (!mint || !creator || !signature || !name || !symbol) {
    return NextResponse.json({ ok: false, error: 'missing_fields' }, { status: 400 });
  }
  if (!validNetwork(network)) {
    return NextResponse.json({ ok: false, error: 'invalid_network' }, { status: 400 });
  }
  try {
    new PublicKey(mint);
    new PublicKey(creator);
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_pubkey' }, { status: 400 });
  }

  if (logUrl && secret) {
    const upstream = tokenNotifyUpstreamUrl(logUrl);
    try {
      const res = await fetch(upstream, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
        },
        body: rawBody,
      });
      const text = await res.text().catch(() => '');
      const ct = res.headers.get('content-type') || 'application/json; charset=utf-8';
      return new NextResponse(text, { status: res.status, headers: { 'Content-Type': ct } });
    } catch {
      return NextResponse.json({ ok: false, error: 'upstream_unreachable' }, { status: 502 });
    }
  }

  const webhook = process.env.DISCORD_TOKEN_CREATE_WEBHOOK_URL?.trim();
  if (!webhook) {
    return NextResponse.json({ ok: true, skipped: true }, { status: 202 });
  }

  try {
    const res = await postDiscordFromBody(webhook, parsed);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json(
        {
          ok: false,
          error: 'discord_upstream',
          status: res.status,
          detail: text.slice(0, 200),
        },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ ok: false, error: 'discord_unreachable' }, { status: 502 });
  }
}
