'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BarChart3, ArrowRightLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ECOSYSTEM_LISTING_SYMBOL } from '@/lib/ecosystemOtcConstants';

const LS_KEY = 'rrtt_treasury_balance_samples_v1';
const WINDOW_MS = 48 * 60 * 60 * 1000;
const TARGET_MS = 24 * 60 * 60 * 1000;

type Sample = { t: number; ui: number };

function readSamples(): Sample[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v
      .map((x) => {
        if (!x || typeof x !== 'object') return null;
        const o = x as Record<string, unknown>;
        const t = typeof o.t === 'number' ? o.t : NaN;
        const ui = typeof o.ui === 'number' ? o.ui : NaN;
        return Number.isFinite(t) && Number.isFinite(ui) ? { t, ui } : null;
      })
      .filter((x): x is Sample => x != null);
  } catch {
    return [];
  }
}

function writeSamples(samples: Sample[]) {
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(samples));
  } catch {
    /* quota / private mode */
  }
}

function parseUi(s: string | null): number | null {
  if (s == null || !String(s).trim()) return null;
  const n = Number(String(s).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function formatDelta(ui: number): string {
  if (!Number.isFinite(ui)) return '—';
  const abs = Math.abs(ui);
  if (abs < 1e-12) return '0';
  const digits = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  const body = abs.toFixed(digits).replace(/\.?0+$/, '');
  return ui > 0 ? `+${body}` : `-${body}`;
}

/**
 * Live treasury RRTT balance from the public otc-treasury route; 24h change uses
 * repeated visits (localStorage samples within 48h) to approximate balance vs ~24h ago.
 */
export function RrttTokenStatsPromo() {
  const [balanceUi, setBalanceUi] = useState<string | null>(null);
  const [treasuryConfigured, setTreasuryConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [delta24h, setDelta24h] = useState<number | null>(null);
  const [has24hBaseline, setHas24hBaseline] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/ecosystem/otc-treasury');
      const j = (await r.json()) as {
        ok?: boolean;
        configured?: boolean;
        treasury?: string;
        rootr_balance_ui?: string | null;
      };
      if (!j.ok || !j.treasury) {
        setTreasuryConfigured(j.configured !== false);
        setBalanceUi(null);
        setDelta24h(null);
        setHas24hBaseline(false);
        return;
      }
      setTreasuryConfigured(true);
      const uiStr =
        typeof j.rootr_balance_ui === 'string' && j.rootr_balance_ui.trim()
          ? j.rootr_balance_ui.trim()
          : null;
      setBalanceUi(uiStr);

      const now = Date.now();
      const current = parseUi(uiStr);
      if (current == null) {
        setDelta24h(null);
        setHas24hBaseline(false);
        return;
      }

      let samples = readSamples().filter((s) => now - s.t <= WINDOW_MS);
      samples.push({ t: now, ui: current });
      samples = samples.sort((a, b) => a.t - b.t);
      writeSamples(samples);

      const cutoff = now - TARGET_MS;
      const older = samples.filter((s) => s.t <= cutoff);
      const baseline =
        older.length > 0 ? older.reduce((best, s) => (s.t > best.t ? s : best)) : null;
      if (baseline) {
        setDelta24h(current - baseline.ui);
        setHas24hBaseline(true);
      } else {
        setDelta24h(null);
        setHas24hBaseline(false);
      }
    } catch {
      setBalanceUi(null);
      setDelta24h(null);
      setHas24hBaseline(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const deltaColor =
    delta24h == null
      ? 'text-muted-foreground'
      : delta24h > 0
        ? 'text-sol-green'
        : delta24h < 0
          ? 'text-red-400'
          : 'text-muted-foreground';

  return (
    <aside
      data-testid="rrtt-token-stats-promo"
      className="rounded-2xl border border-border bg-ink-700/35 px-6 py-6 md:px-8 md:py-7 shadow-[0_0_48px_-20px_rgba(20,241,149,0.22)] h-full flex flex-col"
    >
      <div className="flex flex-col gap-6 flex-1">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-sol-green/35 bg-sol-green/10 text-sol-green">
          <BarChart3 className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">
              Token statistics
            </div>
            <h2 className="font-display text-2xl md:text-3xl tracking-tight text-foreground">
              {ECOSYSTEM_LISTING_SYMBOL} Token
            </h2>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Deposit treasury on-chain balance for the ecosystem listing mint. Figures update when
              you load the page; 24h change compares to a sample from about 24 hours ago on this
              device.
            </p>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-xl border border-border/80 bg-background/40 px-4 py-3">
              <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground mb-1">
                Treasury balance
              </dt>
              <dd className="font-mono tabular-nums text-lg text-foreground">
                {loading ? (
                  <span className="text-muted-foreground">…</span>
                ) : !treasuryConfigured ? (
                  <span className="text-muted-foreground text-base">Not configured</span>
                ) : balanceUi != null ? (
                  <>
                    {balanceUi}
                    <span className="text-muted-foreground font-sans text-sm ml-1.5">
                      {ECOSYSTEM_LISTING_SYMBOL}
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground text-base">—</span>
                )}
              </dd>
            </div>
            <div className="rounded-xl border border-border/80 bg-background/40 px-4 py-3">
              <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground mb-1">
                24h change (balance)
              </dt>
              <dd className={`font-mono tabular-nums text-lg ${deltaColor}`}>
                {loading ? (
                  <span className="text-muted-foreground">…</span>
                ) : has24hBaseline && delta24h != null ? (
                  <>
                    {formatDelta(delta24h)}
                    <span className="text-muted-foreground font-sans text-sm ml-1.5">
                      {ECOSYSTEM_LISTING_SYMBOL}
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground text-base font-sans">
                    Visit again after ~24h
                  </span>
                )}
              </dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-3 pt-1 mt-auto">
            <Button asChild size="sm" className="gap-1.5">
              <Link href="/ecosystem#ecosystem-treasury">
                <ArrowRightLeft className="h-3.5 w-3.5" />
                Transfer from treasury
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}
