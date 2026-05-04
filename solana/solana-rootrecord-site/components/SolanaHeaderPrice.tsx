'use client';

import { useCallback, useEffect, useState } from 'react';

function formatUsd(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function SolanaHeaderPrice() {
  const [usdText, setUsdText] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/sol-price', { cache: 'no-store' });
      const j = (await r.json()) as { ok?: boolean; usd?: number };
      if (j.ok && typeof j.usd === 'number' && Number.isFinite(j.usd) && j.usd > 0) {
        setUsdText(formatUsd(j.usd));
      }
    } catch {
      /* keep last good price when refreshing */
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const display =
    !ready ? null : usdText !== null ? usdText : '—';

  return (
    <div
      data-testid="header-sol-price"
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/60 bg-black/25 px-2.5 py-1 text-[11px] sm:text-xs tabular-nums shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]"
      title="SOL / USD (Jupiter; refreshes every minute)"
    >
      <span className="shrink-0 font-medium text-sol-green">SOL</span>
      <span className="min-w-[4.5rem] text-center font-mono text-foreground/90 sm:min-w-[5.25rem]">
        {display === null ? (
          <span className="inline-block h-3 w-14 animate-pulse rounded bg-muted-foreground/25 sm:h-3.5 sm:w-16" />
        ) : (
          display
        )}
      </span>
    </div>
  );
}
