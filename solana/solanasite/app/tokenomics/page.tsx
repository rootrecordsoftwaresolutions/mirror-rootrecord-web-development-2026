import type { Metadata } from 'next';
import Link from 'next/link';

import {
  ECOSYSTEM_LISTING_NAME,
  ECOSYSTEM_LISTING_SYMBOL,
  ECOSYSTEM_OTC_TOKEN_MINT,
  ECOSYSTEM_SOLSCAN_CPMM_POOL_JUP_RRTT,
  ECOSYSTEM_SOLSCAN_CPMM_POOL_RAY_RRTT,
  ECOSYSTEM_SOLSCAN_CPMM_POOL_SOL,
  ECOSYSTEM_SOLSCAN_CPMM_POOL_USDC,
  ECOSYSTEM_SOLSCAN_DEVELOPER,
  ECOSYSTEM_SOLSCAN_TREASURY,
  OTC_USD_PER_TOKEN,
  ecosystemOtcQuoteRetainPercentLabel,
  solscanAccount,
  solscanToken,
} from '@/lib/ecosystemOtcConstants';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { pageSeo, SEO_KEYWORDS } from '@/lib/seo';

export const metadata: Metadata = pageSeo({
  path: '/tokenomics',
  title: `Tokenomics & markets — ${ECOSYSTEM_LISTING_SYMBOL}`,
  description: `${ECOSYSTEM_LISTING_NAME} (${ECOSYSTEM_LISTING_SYMBOL}): all Raydium CPMM pool addresses, treasury mechanics, OTC reference pricing, and how to think about multi-pool markets on Solana — descriptive, not investment advice.`,
  keywords: [
    ...SEO_KEYWORDS.core,
    ECOSYSTEM_LISTING_SYMBOL,
    'tokenomics',
    'Raydium CPMM',
    'liquidity pools',
    'treasury token',
  ],
});

type PoolRow = {
  pair: string;
  poolId: string;
  role: string;
};

function buildPoolRows(): PoolRow[] {
  const rows: PoolRow[] = [
    {
      pair: 'SOL (WSOL) / RRTT',
      poolId: ECOSYSTEM_SOLSCAN_CPMM_POOL_SOL,
      role:
        'Raydium CPMM. Matched by the Treasury Transfer Tool when buyers pay in SOL: quote is routed into this pool after the configured treasury reserve.',
    },
  ];
  if (ECOSYSTEM_SOLSCAN_CPMM_POOL_USDC.trim()) {
    rows.push({
      pair: 'USDC / RRTT',
      poolId: ECOSYSTEM_SOLSCAN_CPMM_POOL_USDC.trim(),
      role:
        'Raydium CPMM. Matched when buyers pay in USDC: quote is routed into this pool after the same reserve logic.',
    });
  }
  if (ECOSYSTEM_SOLSCAN_CPMM_POOL_JUP_RRTT.trim()) {
    rows.push({
      pair: 'JUP / RRTT',
      poolId: ECOSYSTEM_SOLSCAN_CPMM_POOL_JUP_RRTT.trim(),
      role:
        'Raydium CPMM (Jupiter project token vs RRTT). Open-market venue; aggregators such as Jupiter often route flow here. Not a treasury-transfer deposit rail.',
    });
  }
  if (ECOSYSTEM_SOLSCAN_CPMM_POOL_RAY_RRTT.trim()) {
    rows.push({
      pair: 'RAY / RRTT',
      poolId: ECOSYSTEM_SOLSCAN_CPMM_POOL_RAY_RRTT.trim(),
      role:
        'Raydium CPMM (Raydium governance token vs RRTT). Open-market venue for holders who prefer that quote. Not a treasury-transfer deposit rail.',
    });
  }
  return rows;
}

export default function TokenomicsPage() {
  const poolRows = buildPoolRows();
  const usdcConfigured = Boolean(ECOSYSTEM_SOLSCAN_CPMM_POOL_USDC.trim());

  return (
    <div className="container py-14 md:py-20 max-w-4xl space-y-12">
      <header className="space-y-4">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Pools · tokenomics · markets
        </div>
        <h1 className="font-display text-4xl md:text-5xl tracking-tight">
          {ECOSYSTEM_LISTING_SYMBOL} tokenomics &amp; market context
        </h1>
        <p className="text-muted-foreground leading-relaxed max-w-3xl">
          One place for every public Raydium CPMM pool we surface for{' '}
          {ECOSYSTEM_LISTING_NAME}, how treasury and fees connect to liquidity, and a practical
          framework for reading multi-pool markets. This page is{' '}
          <strong className="text-foreground">descriptive documentation</strong> — not a price
          target, not investment advice, and not a promise of returns. On-chain balances and
          prices change continuously; verify live state on{' '}
          <a
            href="https://solscan.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sol-green hover:underline"
          >
            Solscan
          </a>
          , Raydium, or your aggregator of choice.
        </p>
        <p className="text-sm text-muted-foreground">
          For the live Treasury Transfer Tool and interactive narrative, see{' '}
          <Link href="/ecosystem" className="text-sol-green hover:underline font-medium">
            Purpose
          </Link>
          . For a shareable mint dashboard, see{' '}
          <Link href="/token-stats" className="text-sol-green hover:underline font-medium">
            Token Stats
          </Link>
          .
        </p>
      </header>

      <Card id="pools" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="text-xl md:text-2xl">Liquidity pools (Raydium CPMM)</CardTitle>
          <CardDescription className="leading-relaxed text-base">
            Pool id is the Raydium <strong className="text-foreground">pool state</strong> account
            (what explorers label as the pool), not the SPL mint address for {ECOSYSTEM_LISTING_SYMBOL}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm text-left">
              <thead className="bg-white/5 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Pair</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Pool (Solscan)</th>
                  <th className="px-4 py-3 font-medium min-w-[12rem]">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/80 text-muted-foreground">
                {poolRows.map((row) => (
                  <tr key={row.poolId} className="align-top">
                    <td className="px-4 py-3 font-medium text-foreground">{row.pair}</td>
                    <td className="px-4 py-3">
                      <a
                        href={solscanAccount(row.poolId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-sol-green hover:underline break-all"
                      >
                        {row.poolId}
                      </a>
                    </td>
                    <td className="px-4 py-3 leading-relaxed">{row.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!usdcConfigured ? (
            <p className="text-xs text-muted-foreground border-t border-border/60 pt-4">
              The USDC / {ECOSYSTEM_LISTING_SYMBOL} row appears here automatically when{' '}
              <span className="font-mono">NEXT_PUBLIC_ECOSYSTEM_OTC_CPMM_POOL_ID_USDC</span> is set
              in deployment config. Until then, treasury USDC rails may still be wired server-side
              only — check operator envs and worker behavior separately from this page.
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Trade or add liquidity through{' '}
            <a
              href="https://raydium.io/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sol-green hover:underline"
            >
              Raydium
            </a>{' '}
            or an aggregator such as{' '}
            <a
              href="https://jup.ag/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sol-green hover:underline"
            >
              Jupiter
            </a>
            . Always confirm the pool program, mints, and fee tier in the wallet preview before you
            sign.
          </p>
        </CardContent>
      </Card>

      <Card id="tokenomics" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="text-xl md:text-2xl">Tokenomics — how the pieces fit</CardTitle>
          <CardDescription className="leading-relaxed text-base">
            High-level map of supply, fees, treasury, OTC reference, and automation. Numbers that
            are configurable in this app are called out explicitly; everything else is chain-observed.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-8 leading-relaxed">
          <section className="space-y-3" id="mint-and-symbol">
            <h2 className="text-base font-semibold text-foreground">Mint &amp; listing</h2>
            <p>
              <strong className="text-foreground">{ECOSYSTEM_LISTING_NAME}</strong> trades under the
              symbol <strong className="text-foreground">{ECOSYSTEM_LISTING_SYMBOL}</strong>. The SPL
              mint address (Metaplex metadata + SPL supply) is:
            </p>
            <p>
              <a
                href={solscanToken(ECOSYSTEM_OTC_TOKEN_MINT)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-sol-green hover:underline break-all"
              >
                {ECOSYSTEM_OTC_TOKEN_MINT}
              </a>
            </p>
            <p>
              Total supply, decimals, and authorities (mint / freeze) are whatever the mint was
              created with on-chain. Use Solscan or the{' '}
              <Link href="/token-stats" className="text-sol-green hover:underline">
                Token Stats
              </Link>{' '}
              flow for a snapshot; this page does not cache supply.
            </p>
          </section>

          <section className="space-y-3" id="fees-and-treasury">
            <h2 className="text-base font-semibold text-foreground">Fees, treasury, and LP routing</h2>
            <p>
              RootRecord Solana Tools charge small <strong className="text-foreground">platform fees</strong>{' '}
              on paid actions (token creation, authority changes, Raydium liquidity helpers, bulk
              transfers where applicable, and similar). Those flows are designed to stay inexpensive
              per action while aligning long-term value with continued use of the tooling.
            </p>
            <p>
              Proceeds and inventory concentrate in the{' '}
              <a
                href={solscanAccount(ECOSYSTEM_SOLSCAN_TREASURY)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sol-green hover:underline font-medium"
              >
                treasury wallet
              </a>{' '}
              <span className="font-mono text-xs text-foreground/80">
                ({ECOSYSTEM_SOLSCAN_TREASURY})
              </span>
              , which funds distributions, reserves, and programmatic liquidity adds according to
              operator policy—not a single hard-coded loop you can infer from the front-end alone.
            </p>
            <p>
              The{' '}
              <a
                href={solscanAccount(ECOSYSTEM_SOLSCAN_DEVELOPER)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sol-green hover:underline font-medium"
              >
                developer / operations wallet
              </a>{' '}
              <span className="font-mono text-xs text-foreground/80">
                ({ECOSYSTEM_SOLSCAN_DEVELOPER})
              </span>{' '}
              is documented for transparency. It may participate in stabilization-style activity
              (small, capped trades) separate from the main treasury inventory story—again, verify
              current behavior on-chain rather than trusting prose.
            </p>
          </section>

          <section className="space-y-3" id="otc-reference">
            <h2 className="text-base font-semibold text-foreground">
              Treasury Transfer Tool &amp; USD reference
            </h2>
            <p>
              The in-site Treasury Transfer Tool (on the{' '}
              <Link href="/ecosystem" className="text-sol-green hover:underline">
                Purpose
              </Link>{' '}
              page) offers whole tokens at a published{' '}
              <strong className="text-foreground">USD reference</strong> of{' '}
              <strong className="text-foreground">${OTC_USD_PER_TOKEN} per whole token</strong> for
              the program described there. That reference is a <em>design parameter</em> for the tool,
              not a guarantee that secondary-market AMM prices will match it at all times. When open
              pools trade far from the reference, arbitrageurs may appear—that can help convergence
              but is not assured.
            </p>
            <p>
              After a successful treasury transfer, a configurable share of the SOL or USDC payment
              can remain in treasury (default{' '}
              <strong className="text-foreground">{ecosystemOtcQuoteRetainPercentLabel()}</strong> of
              the quote, unless operators change the basis-points setting). The remainder is the
              portion intended for automated add-liquidity into the Raydium CPMM pool that matches
              the payment rail (WSOL pair for SOL, USDC pair for USDC). JUP and RAY pools listed
              above are <strong className="text-foreground">not</strong> deposit targets for that
              automation path unless code and env are explicitly extended later.
            </p>
          </section>

          <section className="space-y-3" id="referrals">
            <h2 className="text-base font-semibold text-foreground">Referrals</h2>
            <p>
              The site supports referral links (<code className="text-xs font-mono text-foreground/90">?ref=</code>
              ) so a share of certain platform fees can be routed to a referrer in the same
              transaction, per deployment settings. See{' '}
              <Link href="/referrals" className="text-sol-green hover:underline">
                Referrals
              </Link>{' '}
              for mechanics; treasury OTC checkouts are documented on Purpose as excluded from that
              split where applicable.
            </p>
          </section>
        </CardContent>
      </Card>

      <Card id="market-analysis" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="text-xl md:text-2xl">Market analysis — how to read this setup</CardTitle>
          <CardDescription className="leading-relaxed text-base">
            A framework for thinking about {ECOSYSTEM_LISTING_SYMBOL} across several pools, without
            pretending this site streams live order books.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-8 leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">One token, several books</h2>
            <p>
              Each row in the pool table is a separate constant-product AMM <em>book</em> (plus
              Raydium-specific mechanics). The <strong className="text-foreground">same</strong>{' '}
              {ECOSYSTEM_LISTING_SYMBOL} can therefore trade at slightly different implied prices vs
              SOL, USDC, JUP, or RAY at the same timestamp, after fees and curve shape. That is normal:
              cross-pool gaps are the fuel for arbitrage and aggregator routing.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">Liquidity depth vs. breadth</h2>
            <p>
              Adding JUP and RAY pairs increases <strong className="text-foreground">breadth</strong>
              : more wallets can enter or exit without first swapping into SOL or USDC. It does not
              by itself increase <strong className="text-foreground">depth</strong> unless new capital
              actually seeds those pools. If the same inventory is spread thinner, each individual
              pool can show higher slippage for large clips until liquidity grows or flow migrates.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">What to watch on-chain</h2>
            <ul className="list-disc pl-5 space-y-2 marker:text-muted-foreground">
              <li>
                <strong className="text-foreground">Per-pool reserves</strong> — vault balances
                backing each pair; they drive immediate slippage for swaps through that pool.
              </li>
              <li>
                <strong className="text-foreground">Volume and trade count</strong> — Solscan and
                DEX dashboards; use them for activity, not for extrapolating future price.
              </li>
              <li>
                <strong className="text-foreground">Implied price vs. Treasury Transfer reference</strong>{' '}
                — large sustained deviations may attract arb between the tool and AMMs, subject to
                inventory, caps, gas, and execution risk.
              </li>
              <li>
                <strong className="text-foreground">Concentration of LP</strong> — who holds LP
                tokens matters for governance of exit liquidity; public explorers show LP mint
                holders at a high level.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">Aggregators and pathing</h2>
            <p>
              Jupiter and similar routers may split a user&apos;s trade across multiple pools and
              programs. A swap UI price is therefore an <em>effective</em> price for a specific size
              and path, not necessarily the mid of a single pool row on this page. When comparing
              venues, compare <strong className="text-foreground">all-in output</strong> after fees
              for the size you intend to trade.
            </p>
          </section>

          <section className="space-y-3 border-t border-border/60 pt-6" id="risks">
            <h2 className="text-base font-semibold text-foreground">Risks (non-exhaustive)</h2>
            <ul className="list-disc pl-5 space-y-2 marker:text-muted-foreground">
              <li>Smart-contract and program risk on every program touched by a transaction.</li>
              <li>
                <strong className="text-foreground">Impermanent loss</strong> for liquidity
                providers if relative prices move against their entry ratio.
              </li>
              <li>Oracle / stablecoin assumptions for USDC-quoted pools (USDC is treated as $1 in tool copy).</li>
              <li>Regulatory and tax considerations in your jurisdiction — self responsibility.</li>
            </ul>
            <p className="text-xs pt-2">
              Nothing here is an offer to sell or solicitation to buy securities. Past or simulated
              flow on charts does not predict future results.
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
