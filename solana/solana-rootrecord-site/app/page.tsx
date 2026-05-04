import type { Metadata } from 'next';
import Link from 'next/link';

import { HomeStructuredData } from '@/components/seo/HomeStructuredData';
import { pageSeo, SEO_KEYWORDS } from '@/lib/seo';
import { ArrowRight, Flame, Zap, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { JupiterWalletPromo } from '@/components/JupiterWalletPromo';
import { RrttTokenStatsPromo } from '@/components/RrttTokenStatsPromo';

export async function generateMetadata(): Promise<Metadata> {
  return pageSeo({
    path: '/',
    title: 'Solana SPL & Token-2022 tools',
    description:
      'Low-fee Solana token creator and utilities: SPL and Token-2022 mints, Metaplex metadata, revoke mint and freeze authority, bulk freeze or thaw holder ATAs, Token-2022 transfer fees, Raydium CPMM liquidity, bulk SOL sends, and printable cold-storage paper wallets. Transparent flat SOL pricing — no subscriptions.',
    keywords: [
      ...SEO_KEYWORDS.core,
      'cheap Solana token creator',
      'SPL token creator',
      'create token on Solana',
      'update Metaplex metadata',
    ],
  });
}

const COMPETITORS = [
  { name: 'RootRecord (you)', fee: '0.025 SOL', note: 'No subscriptions. No upsells. No nags.' },
  { name: 'Solmint / Slerf.tools', fee: '~0.05 SOL', note: 'Often double, plus optional “add-ons”.' },
  { name: 'CoinFactory', fee: '~0.06 SOL', note: 'Tiered pricing for things that should be one click.' },
  { name: 'Orion / 20lab', fee: '0.05–0.1 SOL+', note: 'Premium tiers for basic on-chain actions.' },
  { name: 'Real on-chain cost', fee: '~0.01 SOL', note: 'Rent + tx fees. Everything else is margin.' },
];

export default function HomePage() {
  return (
    <>
      <HomeStructuredData />
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-aurora pointer-events-none" />
        <div className="absolute inset-0 grid-faint-bg pointer-events-none opacity-60" />
        <div className="container relative pt-20 pb-24 md:pt-28 md:pb-32">
          <div className="max-w-4xl">
            <Badge data-testid="hero-badge" className="mb-7">
              <span className="h-1.5 w-1.5 rounded-full bg-sol-green mr-2 animate-pulse" />
              Live on Solana mainnet
            </Badge>

            <h1
              data-testid="hero-title"
              className="font-display text-5xl md:text-7xl leading-[1.04] tracking-tight"
            >
              On-chain tools that respect{' '}
              <em className="text-sol-green not-italic font-display italic">your SOL</em>,{' '}
              <em className="text-sol-purple not-italic font-display italic">your time</em>,{' '}
              and{' '}
              <em className="text-foreground font-display italic">your tokens</em>.
            </h1>

            <p
              data-testid="hero-tagline"
              className="mt-7 max-w-2xl text-base md:text-lg text-muted-foreground leading-relaxed"
            >
              RootRecord Solana Tools is the cheap, fast, no-BS way to launch and manage
              SPL tokens. Pay once per action — never a subscription. Roughly half the
              fee of every other token creator out there.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Button
                asChild
                size="lg"
                data-testid="cta-launch"
                className="group"
              >
                <Link href="/create">
                  Launch in 60 seconds
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" data-testid="cta-pricing">
                <Link href="/pricing">See the receipts</Link>
              </Button>
              <Button asChild size="lg" variant="ghost" data-testid="cta-start">
                <Link href="/dashboard#dashboard-start">New? Start here</Link>
              </Button>
            </div>

            {/* trust bar */}
            <div
              data-testid="trust-bar"
              className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-muted-foreground"
            >
              <span className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-sol-green" />
                <span>
                  <strong className="text-foreground">0.025 SOL</strong> create fee
                </span>
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-sol-purple" />
                <span>
                  Real on-chain cost{' '}
                  <strong className="text-foreground">≈ 0.01 SOL</strong>
                </span>
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-foreground/40" />
                <span>No hidden fees, no upsells</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* WALLET + RRTT stats */}
      <section
        className="container pt-4 pb-16 md:pt-2 md:pb-20"
        aria-labelledby="jupiter-wallet-heading"
      >
        <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
          <JupiterWalletPromo variant="featured" />
          <RrttTokenStatsPromo />
        </div>
      </section>

      {/* PRINCIPLES (rootrecord style) */}
      <section className="container py-20">
        <div className="grid md:grid-cols-3 gap-10">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">
              Principles in practice
            </div>
            <h2 className="font-display text-3xl md:text-4xl tracking-tight">
              Why people choose <em className="italic text-sol-purple">RootRecord</em>.
            </h2>
          </div>
          <div className="md:col-span-2 grid sm:grid-cols-2 gap-x-10 gap-y-8 text-sm">
            {[
              {
                t: 'Your wallet, your keys',
                d: 'Every transaction is signed in your wallet. We never touch your private key, ever.',
              },
              {
                t: 'Real costs, real numbers',
                d: 'A clear breakdown of on-chain rent versus our fee — every page, every action.',
              },
              {
                t: 'Pay once per action',
                d: 'No subscriptions. Use the tools you need, when you need them.',
              },
              {
                t: 'Mainnet hardened',
                d: 'Built on @solana/web3.js + Metaplex v3 — the same primitives the chain runs on.',
              },
            ].map((p) => (
              <div key={p.t}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-sol-green" />
                  <h3 className="text-base font-semibold">{p.t}</h3>
                </div>
                <p className="text-muted-foreground leading-relaxed">{p.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COMPETITOR COMPARISON */}
      <section className="container py-20" id="compare">
        <div className="max-w-3xl">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">
            The receipts
          </div>
          <h2 className="font-display text-3xl md:text-5xl tracking-tight">
            Roughly half the price.{' '}
            <em className="italic text-sol-green">Twice the respect</em>.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Most token tools markup the same on-chain action by 5–10x. We charge a
            modest, fixed fee on top of network costs — and we&apos;re upfront about
            the breakdown.
          </p>
        </div>

        <div
          data-testid="competitor-table"
          className="mt-10 overflow-hidden rounded-2xl border border-border bg-card/50"
        >
          <div className="grid grid-cols-12 px-6 py-4 text-xs uppercase tracking-[0.14em] text-muted-foreground border-b border-border">
            <div className="col-span-5">Tool</div>
            <div className="col-span-3">Create fee</div>
            <div className="col-span-4">Reality check</div>
          </div>
          {COMPETITORS.map((c, i) => (
            <div
              key={c.name}
              className={
                'grid grid-cols-12 px-6 py-5 text-sm items-center ' +
                (i === 0 ? 'bg-sol-green/5' : '') +
                (i < COMPETITORS.length - 1 ? ' border-b border-border' : '')
              }
            >
              <div className="col-span-5 font-medium flex items-center gap-2">
                {i === 0 && <Flame className="h-4 w-4 text-sol-green" />}
                {c.name}
              </div>
              <div className="col-span-3 font-mono text-foreground">{c.fee}</div>
              <div className="col-span-4 text-muted-foreground">{c.note}</div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Fees collected from public pricing pages of competitors as of Q1 2026.
          We&apos;ll happily update if anyone publishes lower numbers.
        </p>
      </section>

      {/* FINAL CTA */}
      <section className="container py-24">
        <Card className="overflow-hidden relative">
          <div className="absolute inset-0 bg-aurora pointer-events-none opacity-80" />
          <div className="relative grid md:grid-cols-2 gap-10 p-10 md:p-14">
            <div>
              <h2 className="font-display text-3xl md:text-5xl tracking-tight">
                Start with the <em className="italic text-sol-green">tool</em> that matches your work.
              </h2>
              <p className="mt-4 text-muted-foreground max-w-md">
                Connect your wallet, fill the form, sign one transaction. You own
                the mint — RootRecord just handled the plumbing.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4 md:justify-end">
              <Button asChild size="lg" data-testid="footer-cta-create">
                <Link href="/create">
                  <Zap className="h-4 w-4" /> Create Token
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="purple"
                data-testid="footer-cta-tools"
              >
                <Link href="/tools">
                  <Wallet className="h-4 w-4" /> Open Tools
                </Link>
              </Button>
            </div>
          </div>
        </Card>
      </section>
    </>
  );
}
