'use client';

import Link from 'next/link';
import { ArrowRight, Construction, Lock, Timer, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/**
 * Root Record is replacing third-party vesting integrations with our own on-chain programs
 * (linear unlocks, cliffs, treasuries, per-wallet schedules). Until that ships, this page is the
 * product surface for expectations and docs — no external vesting protocol is invoked from here.
 */
export function LinearVestingClient() {
  return (
    <div className="space-y-10 max-w-3xl">
      <Card className="border-sol-purple/35 bg-ink-950/50">
        <CardHeader>
          <div className="flex items-center gap-2 text-sol-purple">
            <Construction className="h-5 w-5" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-widest">In development</span>
          </div>
          <CardTitle className="text-xl">Root Record native vesting</CardTitle>
          <CardDescription className="text-sm leading-relaxed text-muted-foreground">
            We are building first-party vesting, locks, and treasury releases on Solana so founders
            and investors get predictable, explorer-verifiable schedules without routing funds
            through a separate third-party protocol. The previous Streamflow-backed flow has been
            removed on purpose.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild variant="purple">
            <Link href="/docs">
              Read how it will work
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/tools">Token tools (live)</Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-border/80 bg-background/40">
          <CardHeader className="pb-2">
            <Timer className="h-5 w-5 text-sol-green mb-1" aria-hidden />
            <CardTitle className="text-base">Schedules</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground leading-relaxed">
            Linear vesting, cliff + tranches, and TGE + tail curves — configured once, enforced on-chain.
          </CardContent>
        </Card>
        <Card className="border-border/80 bg-background/40">
          <CardHeader className="pb-2">
            <Lock className="h-5 w-5 text-sol-green mb-1" aria-hidden />
            <CardTitle className="text-base">Locks &amp; custody</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground leading-relaxed">
            Timelocked vaults, treasury splits, and staged releases with clear beneficiary rules.
          </CardContent>
        </Card>
        <Card className="border-border/80 bg-background/40">
          <CardHeader className="pb-2">
            <Users className="h-5 w-5 text-sol-green mb-1" aria-hidden />
            <CardTitle className="text-base">Deal structure</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground leading-relaxed">
            Per-wallet allocations, SPL and Token-2022 mints, and reporting-friendly labels.
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground border-t border-border/60 pt-6">
        Issuance, authority changes, burns, metadata, liquidity, and bulk sends stay available across
        the rest of this site today. When native vesting is ready, you will connect the same wallet
        here to create and manage Root Record programs only.
      </p>
    </div>
  );
}
