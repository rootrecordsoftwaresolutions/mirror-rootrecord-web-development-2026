import Link from 'next/link';

import { ECOSYSTEM_LISTING_SYMBOL } from '@/lib/ecosystemOtcConstants';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function LiquidityTimingPage() {
  return (
    <div className="container py-14 md:py-20 max-w-3xl space-y-10">
      <header className="space-y-3">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Operations</div>
        <h1 className="font-display text-4xl md:text-5xl tracking-tight">Liquidity timing</h1>
        <p className="text-muted-foreground leading-relaxed max-w-2xl">
          RootRecord keeps treasury Raydium CPMM positions within configured floors using a{' '}
          <strong className="text-foreground">fixed UTC schedule</strong>. A short job runs on the
          RootRecord API Worker (<code className="text-xs font-mono text-foreground/90">rootrecord-primary</code>
          ), which calls a dedicated Solana transaction Worker (
          <code className="text-xs font-mono text-foreground/90">rootrecord-solana-tx</code>) over HTTP
          with an operator secret. On-chain signing uses the same treasury key material as earn and
          custodial flows (<code className="text-xs font-mono text-foreground/90">RRTT_TREASURY_SECRET_KEY_B58</code>
          on the Solana Worker).
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Why a schedule</CardTitle>
          <CardDescription className="text-base leading-relaxed">
            Raydium maintenance touches RPC, pool state, and sometimes large transactions. Running
            at predictable minutes spreads work across the hour and keeps the automation separate
            from interactive site traffic. Times below are{' '}
            <strong className="text-foreground">UTC</strong>.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Trigger: every five minutes</CardTitle>
          <CardDescription className="text-base leading-relaxed">
            Cloudflare invokes the API Worker on{' '}
            <code className="text-xs font-mono text-foreground/90">*/5 * * * *</code> (minutes 0, 5,
            10, 15, …). The handler always runs routine weather-related work first; then it inspects
            the scheduled minute. Only <strong className="text-foreground">:00</strong> and{' '}
            <strong className="text-foreground">:10</strong> enqueue treasury Solana jobs, so each
            automation runs <strong className="text-foreground">once per hour</strong> at those
            marks.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">:00 UTC — native SOL (treasury operations)</CardTitle>
          <CardDescription className="text-base leading-relaxed">
            Internal endpoint: <code className="text-xs font-mono text-foreground/90">POST …/run-treasury-sol-lp-check</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-4 leading-relaxed">
          <p>
            <strong className="text-foreground">Goal:</strong> keep the treasury wallet above a
            minimum of <strong className="text-foreground">native SOL</strong> so it can pay network
            fees and sponsor custodial flows. The floor comes from{' '}
            <code className="text-xs font-mono text-foreground/90">TREASURY_MIN_SOL_UI</code> on the
            Solana Worker (commonly around <strong className="text-foreground">0.01 SOL</strong>; exact
            value is deployment-specific).
          </p>
          <p>
            <strong className="text-foreground">Mechanism:</strong> if native SOL is below that
            threshold, the Worker withdraws LP from the treasury&apos;s{' '}
            <strong className="text-foreground">RRESERVE / WSOL</strong> Raydium CPMM pool configured
            as <code className="text-xs font-mono text-foreground/90">TREASURY_SOL_CP_POOL_ID</code>,
            burning LP shares held by the treasury and returning wrapped SOL, then unwrapping to native
            SOL where the builder allows. If the pool id or mint envs are missing, the run is skipped
            with a logged reason rather than failing the whole Worker.
          </p>
          <p>
            <strong className="text-foreground">Net effect:</strong> inventory moves from the SOL-side
            Raydium pool into spendable lamports on the treasury, prioritizing operational SOL over
            LP depth until the floor is restored.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            :10 UTC — {ECOSYSTEM_LISTING_SYMBOL} and RRESERVE SPL floors
          </CardTitle>
          <CardDescription className="text-base leading-relaxed">
            Internal endpoint:{' '}
            <code className="text-xs font-mono text-foreground/90">POST …/run-treasury-liquidity-check</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-4 leading-relaxed">
          <p>
            <strong className="text-foreground">Goal:</strong> keep minimum on-hand balances of{' '}
            <strong className="text-foreground">{ECOSYSTEM_LISTING_SYMBOL}</strong> and{' '}
            <strong className="text-foreground">RRESERVE</strong> on the treasury for earn, liquidity
            tooling, and related programs. Minimums are whole-token UI strings on the Solana Worker:{' '}
            <code className="text-xs font-mono text-foreground/90">TREASURY_LIQ_MIN_RRTT_UI</code> and{' '}
            <code className="text-xs font-mono text-foreground/90">TREASURY_LIQ_MIN_RRESERVE_UI</code>{' '}
            (defaults in code are high enough that normal operations expect millions of whole{' '}
            {ECOSYSTEM_LISTING_SYMBOL} and a small whole number of RRESERVE—treat docs as illustrative
            and read live env for your deployment).
          </p>
          <p>
            <strong className="text-foreground">Mechanism:</strong> the Worker compares SPL balances
            at the treasury ATAs to those floors. If either leg is short, it burns treasury-held LP on
            the <strong className="text-foreground">{ECOSYSTEM_LISTING_SYMBOL} / RRESERVE</strong> CPMM
            pool <code className="text-xs font-mono text-foreground/90">TREASURY_CP_MM_POOL_ID</code>{' '}
            to release underlying tokens. If balances are still short after that (for example LP was
            thin or already depleted), an optional second wallet{' '}
            <code className="text-xs font-mono text-foreground/90">TREASURY_MAINTENANCE_SOURCE_SECRET_KEY_B58</code>{' '}
            may transfer SPL from inventory into the treasury. Failures and persistent shortages can
            emit Discord notifications when webhooks are configured.
          </p>
          <p>
            <strong className="text-foreground">Net effect:</strong> SPL inventory on the treasury
            is replenished from Raydium LP (and optionally from a maintenance wallet) before user-facing
            jobs need those tokens—without tying the process to browser sessions or manual clicks.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Other automation you may see referenced</CardTitle>
          <CardDescription className="text-base leading-relaxed">
            Separate from the Raydium five-minute cadence above.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-4 leading-relaxed">
          <p>
            <strong className="text-foreground">Earn → custodial mirror (07:00 UTC):</strong> the same
            API Worker runs a <strong className="text-foreground">daily</strong> cron (
            <code className="text-xs font-mono text-foreground/90">0 7 * * *</code>) that can push
            owed {ECOSYSTEM_LISTING_SYMBOL} from treasury to hosted custodial wallets and top up
            custodial SOL reserves. That job answers product settlement, not Raydium LP shape.
          </p>
          <p>
            <strong className="text-foreground">Manual runs:</strong> operators can POST the same
            internal treasury routes with the admin key when debugging or catching up—behavior
            matches the scheduled invocations.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">How to verify on-chain</CardTitle>
          <CardDescription className="text-base leading-relaxed">
            Explorer truth beats documentation when the two differ.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-3 leading-relaxed">
          <p>
            Confirm treasury pubkey, pool ids, and transaction history in Solscan (or your preferred
            explorer) using the env values actually deployed. Jupiter marks and pool reserves change
            continuously; this page describes <em>when</em> automation runs and <em>what</em> it is
            designed to do, not future prices or yields.
          </p>
          <p>
            For pool addresses and reserve accounting context, see{' '}
            <Link href="/tokenomics" className="text-sol-green hover:underline">
              Tokenomics
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
