'use client';

import Link from 'next/link';

import { WalletMultiButton } from '@/components/wallet/WalletButton';
import { ReferralPill } from '@/components/ReferralPill';
import { RootRecordPortalNav } from '@/components/RootRecordPortalNav';

export function Header() {
  return (
    <header
      data-testid="site-header"
      className="sticky top-0 z-40 border-b border-border bg-ink-900/70 backdrop-blur-md"
    >
      <div className="container flex h-16 items-center justify-between gap-3">
        <Link
          href="/"
          data-testid="brand-link"
          className="flex items-baseline gap-2 group min-w-0 shrink"
        >
          <span className="text-lg font-semibold tracking-tight">
            Root<span className="text-sol-green">Record</span>
          </span>
          <span className="text-xs text-muted-foreground hidden sm:inline truncate">
            / Solana Tools
          </span>
        </Link>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <ReferralPill />
          <RootRecordPortalNav />
          <div data-testid="wallet-button-wrap" className="rr-wallet-btn">
            <WalletMultiButton />
          </div>
        </div>
      </div>
    </header>
  );
}
