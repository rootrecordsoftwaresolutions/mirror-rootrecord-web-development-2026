'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';

import { Button } from '@/components/ui/button';
import { fetchCustodialInfo, getPortalToken } from '@/lib/rootrecordSession';
import { getConnection } from '@/lib/solana';

function shortPk(b58: string): string {
  const t = b58.trim();
  if (t.length <= 14) return t;
  return `${t.slice(0, 6)}…${t.slice(-4)}`;
}

export function DashboardWelcome() {
  const { publicKey, connected } = useWallet();
  const [solUi, setSolUi] = useState<string | null>(null);
  const [hostedPk, setHostedPk] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const token = getPortalToken();
    if (!token) {
      setHostedPk(null);
      return;
    }
    void (async () => {
      const info = await fetchCustodialInfo(token);
      if (cancelled) return;
      const pk = info?.public_key?.trim();
      if (info?.custodial_enabled && pk) setHostedPk(pk);
      else setHostedPk(null);
    })();
    const onAuth = () => {
      const t = getPortalToken();
      if (!t) {
        setHostedPk(null);
        return;
      }
      void fetchCustodialInfo(t).then((info) => {
        if (cancelled) return;
        const pk = info?.public_key?.trim();
        if (info?.custodial_enabled && pk) setHostedPk(pk);
        else setHostedPk(null);
      });
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('rootrecord-portal-auth-change', onAuth);
    }
    return () => {
      cancelled = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener('rootrecord-portal-auth-change', onAuth);
      }
    };
  }, []);

  useEffect(() => {
    if (!publicKey) {
      setSolUi(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const lamports = await getConnection().getBalance(publicKey);
        if (!cancelled) setSolUi((lamports / LAMPORTS_PER_SOL).toFixed(4));
      } catch {
        if (!cancelled) setSolUi(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col justify-center px-5 py-16 md:min-h-[min(70vh,32rem)] md:px-10 md:py-20">
      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-sol-green/90">
        Solana mainnet
      </p>
      <h1 className="font-display mt-3 text-4xl tracking-tight text-foreground md:text-5xl">Hub</h1>
      <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
        Open a section from the sidebar, or jump to{' '}
        <Link href="/tools" className="text-sol-green underline-offset-4 hover:underline">
          all tools
        </Link>
        . Docs live in{' '}
        <Link href="/operations" className="text-sol-green underline-offset-4 hover:underline">
          Operations
        </Link>
        .
      </p>

      <dl className="mt-12 grid gap-6 text-sm md:grid-cols-2 md:gap-10">
        <div className="space-y-1">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Wallet</dt>
          <dd className="font-mono text-[13px] text-foreground/95">
            {connected && publicKey ? (
              <>
                {shortPk(publicKey.toBase58())}
                {solUi != null ? (
                  <span className="mt-1 block text-muted-foreground">
                    Balance ~{solUi} SOL
                  </span>
                ) : null}
              </>
            ) : (
              <span className="text-muted-foreground">
                Not connected — use <strong className="font-normal text-foreground/80">Select wallet</strong> in the header to sign.
              </span>
            )}
          </dd>
        </div>
        <div className="space-y-1">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Hosted</dt>
          <dd className="font-mono text-[13px] text-foreground/95">
            {hostedPk ? (
              shortPk(hostedPk)
            ) : (
              <span className="text-muted-foreground">Sign in via Account when custodial is enabled.</span>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-14 flex flex-wrap gap-3">
        <Button asChild size="default">
          <Link href="/create">Create token</Link>
        </Button>
        <Button asChild size="default" variant="outline">
          <Link href="/tools">All tools</Link>
        </Button>
      </div>
    </div>
  );
}
