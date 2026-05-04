'use client';

import Link from 'next/link';

import { WalletMultiButton } from '@/components/wallet/WalletButton';
import { ReferralPill } from '@/components/ReferralPill';
import { RootRecordPortalNav } from '@/components/RootRecordPortalNav';
import { SolanaHeaderPrice } from '@/components/SolanaHeaderPrice';

export function Header() {
  return (
    <header
      data-testid="site-header"
      className="sticky top-0 z-40 border-b border-border bg-ink-900/70 backdrop-blur-md"
    >
      <div className="container flex h-16 items-center gap-2 sm:gap-3">
        <Link
          href="/"
          data-testid="brand-link"
          className="flex min-w-0 shrink-0 items-baseline gap-2 group"
        >
          <span className="text-lg font-semibold tracking-tight">
            Root<span className="text-sol-green">Record</span>
          </span>
          <span className="hidden truncate text-xs text-muted-foreground sm:inline">
            / Solana Tools
          </span>
        </Link>

        <div className="flex min-w-0 flex-1 justify-center px-1">
          <SolanaHeaderPrice />
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
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
