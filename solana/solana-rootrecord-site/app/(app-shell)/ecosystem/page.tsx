import Link from 'next/link';
import { ExternalLink } from 'lucide-react';

import { RrttTokenStatsPromo } from '@/components/RrttTokenStatsPromo';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ECOSYSTEM_LISTING_NAME,
  ECOSYSTEM_LISTING_SYMBOL,
  ECOSYSTEM_OTC_TOKEN_MINT,
  ECOSYSTEM_SOLSCAN_CPMM_POOL_JUP_RRTT,
  ECOSYSTEM_SOLSCAN_CPMM_POOL_RAY_RRTT,
  ECOSYSTEM_SOLSCAN_CPMM_POOL_SOL,
  ECOSYSTEM_SOLSCAN_CPMM_POOL_USDC,
  ECOSYSTEM_SOLSCAN_DEVELOPER,
  ECOSYSTEM_SOLSCAN_RRESERVE,
  ECOSYSTEM_SOLSCAN_TREASURY,
  solscanAccount,
  solscanToken,
} from '@/lib/ecosystemOtcConstants';

function ExplorerLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-sm text-sol-green hover:underline"
    >
      {label}
      <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
    </a>
  );
}

export default function EcosystemPage() {
  return (
    <div className="container py-14 md:py-20 max-w-3xl space-y-10">
      <header className="space-y-3">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Program</div>
        <h1 className="font-display text-4xl md:text-5xl tracking-tight">Ecosystem</h1>
        <p className="text-muted-foreground leading-relaxed max-w-2xl">
          <strong className="text-foreground">{ECOSYSTEM_LISTING_NAME}</strong> (
          <span className="font-mono text-foreground/90">{ECOSYSTEM_LISTING_SYMBOL}</span>) is the
          Metaplex-listed SPL mint RootRecord uses for treasury-held inventory, Raydium CPMM legs, and
          custodial / earn accounting. Figures below read from public RPC; explorers are the source of
          truth for signatures and pool state.
        </p>
      </header>

      <RrttTokenStatsPromo />

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">On-chain references</CardTitle>
          <CardDescription className="text-base leading-relaxed">
            Solscan (mainnet). Env overrides in deployment may change these defaults.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <ExplorerLink href={solscanToken(ECOSYSTEM_OTC_TOKEN_MINT)} label="Listing mint" />
          <ExplorerLink href={solscanAccount(ECOSYSTEM_SOLSCAN_TREASURY)} label="Treasury wallet" />
          <ExplorerLink href={solscanAccount(ECOSYSTEM_SOLSCAN_DEVELOPER)} label="Developer wallet" />
          <ExplorerLink href={solscanAccount(ECOSYSTEM_SOLSCAN_CPMM_POOL_SOL)} label="CPMM pool (SOL leg)" />
          <ExplorerLink href={solscanAccount(ECOSYSTEM_SOLSCAN_CPMM_POOL_USDC)} label="CPMM pool (USDC leg)" />
          <ExplorerLink href={solscanAccount(ECOSYSTEM_SOLSCAN_CPMM_POOL_JUP_RRTT)} label="CPMM pool (JUP / RRTT)" />
          <ExplorerLink href={solscanAccount(ECOSYSTEM_SOLSCAN_CPMM_POOL_RAY_RRTT)} label="CPMM pool (RAY / RRTT)" />
          <ExplorerLink href={solscanAccount(ECOSYSTEM_SOLSCAN_RRESERVE)} label="RRESERVE pair account" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Related</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>
            <Link href="/liquidity-timing" className="text-sol-green hover:underline font-medium">
              Liquidity timing
            </Link>{' '}
            — UTC schedule for treasury Raydium maintenance and SPL floor checks.
          </p>
          <p>
            <Link href="/tokenomics" className="text-sol-green hover:underline font-medium">
              Tokenomics
            </Link>{' '}
            — supply, accounting ratio, and pool context for {ECOSYSTEM_LISTING_SYMBOL}.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
