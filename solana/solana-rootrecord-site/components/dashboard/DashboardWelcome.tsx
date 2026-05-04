'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';

import { Badge } from '@/components/ui/badge';
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
    <div className="mx-auto max-w-xl px-4 py-8 md:px-8">
      <Badge className="mb-3 border-sol-green/30 bg-sol-green/10 text-sol-green">Solana mainnet</Badge>
      <h1 className="font-display text-3xl tracking-tight text-foreground md:text-4xl">Welcome</h1>
      <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
        Use the sidebar for tools and pages. Program docs and on-chain references live in{' '}
        <Link href="/operations" className="text-sol-green hover:underline">
          Operations
        </Link>
        .
      </p>

      <div className="mt-6 rounded-lg border border-border/70 bg-card/30 px-4 py-3 text-sm space-y-2">
        {connected && publicKey ? (
          <p className="text-foreground/90">
            <span className="text-muted-foreground">Wallet</span>{' '}
            <span className="font-mono">{shortPk(publicKey.toBase58())}</span>
            {solUi != null ? (
              <>
                <span className="text-muted-foreground"> · </span>
                <span>~{solUi} SOL</span>
              </>
            ) : null}
          </p>
        ) : (
          <p className="text-muted-foreground">Connect a wallet in the header to sign transactions.</p>
        )}
        {hostedPk ? (
          <p className="text-foreground/90">
            <span className="text-muted-foreground">Hosted</span>{' '}
            <span className="font-mono">{shortPk(hostedPk)}</span>
          </p>
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button asChild size="sm">
          <Link href="/create">Create token</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/tools">All tools</Link>
        </Button>
      </div>
    </div>
  );
}
