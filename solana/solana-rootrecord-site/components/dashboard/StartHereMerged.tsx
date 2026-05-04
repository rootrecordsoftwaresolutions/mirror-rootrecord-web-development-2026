'use client';

import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  Coins,
  ExternalLink,
  ListChecks,
  ShieldCheck,
  Sparkles,
  Wallet,
  Wrench,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  CREATE_FEE_SOL,
  ACTION_FEE_SOL,
  REFERRAL_FEE_SHARE_BPS,
} from '@/lib/solana';

const STEPS: {
  n: string;
  title: string;
  body: string;
  icon: typeof Wallet;
}[] = [
  {
    n: '01',
    title: 'Install a Solana wallet',
    body: 'You need a self-custody wallet (Phantom, Solflare, Jupiter, Backpack, etc.). RootRecord never asks for your seed phrase — only normal “connect” and “approve transaction” prompts from your wallet app or browser extension.',
    icon: Wallet,
  },
  {
    n: '02',
    title: 'Connect on this site',
    body: 'Use Select Wallet in the top-right of any page, pick your wallet, and approve the connection. Until you connect, Create and some flows stay disabled — that is intentional.',
    icon: ListChecks,
  },
  {
    n: '03',
    title: 'Know what you are paying',
    body: `Each paid action charges a small, fixed RootRecord fee in SOL (for example ~${CREATE_FEE_SOL} SOL to create a token and ~${ACTION_FEE_SOL} SOL for most tools), plus Solana network rent and fees. There are no subscriptions. If you used someone’s referral link (${REFERRAL_FEE_SHARE_BPS > 0 ? `${(REFERRAL_FEE_SHARE_BPS / 100).toFixed(REFERRAL_FEE_SHARE_BPS % 100 === 0 ? 0 : 2)}%` : '0%'} of the platform fee goes to them in the same transaction by default). See Pricing for the full list.`,
    icon: Coins,
  },
  {
    n: '04',
    title: 'Create a token (typical path)',
    body: 'Open Create, enter name, symbol, supply, and decimals. Optionally add a logo and social links — if IPFS is configured, metadata is pinned for explorers. Review the fee sidebar, then sign one transaction (or two for advanced Token-2022 setups). You receive the mint address and own the mint.',
    icon: Sparkles,
  },
  {
    n: '05',
    title: 'After launch: tools',
    body: 'From the success screen or Tools, you can revoke mint or freeze authority, bulk freeze or thaw up to 100 holder wallets (toggle; no RootRecord fee while waived), mint more supply, update listing metadata, handle Token-2022 transfer fees, or burn tokens. Each action uses the same transparent fee pattern except where a tool is explicitly free.',
    icon: Wrench,
  },
  {
    n: '06',
    title: 'Verify on an explorer',
    body: 'Every confirmation gives a signature you can open on Solscan or another explorer. That is the ground truth: your wallet signed; the programs ran on Solana. We do not custody your tokens or your keys.',
    icon: ShieldCheck,
  },
];

/** Former /start page — lives on the dashboard hub only. */
export function StartHereMerged() {
  return (
    <div className="space-y-12 md:space-y-16">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Start here</div>
        <Badge className="mb-4 border-sol-green/40 bg-sol-green/10 text-sol-green">For new visitors</Badge>
        <h2 className="font-display text-3xl tracking-tight text-foreground md:text-5xl leading-[1.08]">
          How RootRecord works,{' '}
          <em className="text-sol-green not-italic font-display italic">step by step</em>.
        </h2>
        <p className="mt-5 max-w-3xl text-base text-muted-foreground leading-relaxed md:text-lg">
          RootRecord Solana Tools helps you launch and manage SPL tokens on Solana with clear pricing and
          wallet-only signing. This block is the short path from “I just arrived” to “I know what to click
          next.”
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg" className="group">
            <Link href="/create">
              Go to Create
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/pricing">See pricing</Link>
          </Button>
          <Button asChild size="lg" variant="ghost">
            <Link href="/docs" className="inline-flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Full docs
            </Link>
          </Button>
        </div>
      </div>

      <section aria-labelledby="start-steps-heading">
        <h3 id="start-steps-heading" className="sr-only">
          Steps from wallet to verified transaction
        </h3>
        <div className="grid gap-5 md:grid-cols-2">
          {STEPS.map((s) => (
            <Card
              key={s.n}
              className="h-full border-border/80 bg-card/40 transition-all duration-300 hover:border-sol-green/30 hover:shadow-[0_0_40px_-16px_rgba(20,241,149,0.2)]"
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-xs font-mono text-sol-green/80 tracking-widest">{s.n} /</span>
                  <s.icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                </div>
                <CardTitle className="mt-3 text-lg md:text-xl">{s.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm leading-relaxed text-muted-foreground">
                  {s.body}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="max-w-3xl">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">Before you spend SOL</div>
        <h3 className="font-display text-2xl md:text-3xl tracking-tight mb-6">
          Quick <em className="italic text-sol-purple">checklist</em>
        </h3>
        <ul className="space-y-3 text-sm text-muted-foreground md:text-base leading-relaxed">
          <li className="flex gap-3">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sol-green" />
            <span>
              You are on <strong className="text-foreground">Solana mainnet</strong> unless you intentionally
              use a dev build pointed at devnet — wrong network means failed or confusing transactions.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sol-green" />
            <span>
              Your wallet has <strong className="text-foreground">enough SOL</strong> for the RootRecord fee
              plus rent (create is the heaviest; pricing breaks it down).
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sol-green" />
            <span>
              You understand <strong className="text-foreground">mint authority</strong>: if you keep it, you
              can mint more; if you revoke it, supply is fixed — common for memecoins and transparency.
            </span>
          </li>
        </ul>
      </section>

      <section>
        <Card className="overflow-hidden border-border bg-ink-800/30">
          <CardContent className="grid items-center gap-8 p-8 md:grid-cols-2 md:p-10">
            <div>
              <div className="mb-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Optional next reads
              </div>
              <h3 className="font-display text-2xl tracking-tight md:text-3xl">
                Referrals, liquidity, and <em className="italic text-sol-green">bulk sends</em>
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                If you share links with <span className="font-mono text-xs">?ref=</span> your wallet,
                attribution can be recorded for future programs — see{' '}
                <Link href="/referrals" className="text-sol-green hover:underline">
                  Referrals
                </Link>
                . Liquidity and bulk tools are separate flows with their own screens and fees; start with
                Create until you need them.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row md:flex-col md:items-stretch">
              <Button asChild variant="outline">
                <Link href="/referrals">Referral program</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/liquidity">Liquidity</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/bulk">Bulk SOL</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <p className="text-center text-sm text-muted-foreground">
        Not financial advice. Tokens can be worthless or illiquid. If something errors, read the message,
        check your balance, and try again — or open{' '}
        <Link href="/docs" className="text-sol-green hover:underline">
          Docs
        </Link>{' '}
        for detail.
        {' · '}
        <a
          href="https://solscan.io"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sol-green hover:underline"
        >
          Solscan <ExternalLink className="h-3 w-3" />
        </a>
      </p>
    </div>
  );
}
