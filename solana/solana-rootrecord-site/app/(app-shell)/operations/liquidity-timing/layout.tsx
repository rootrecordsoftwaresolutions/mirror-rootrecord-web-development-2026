import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { ECOSYSTEM_LISTING_SYMBOL } from '@/lib/ecosystemOtcConstants';
import { pageSeo, SEO_KEYWORDS } from '@/lib/seo';

export const metadata: Metadata = pageSeo({
  path: '/operations/liquidity-timing',
  title: `Liquidity timing — ${ECOSYSTEM_LISTING_SYMBOL}`,
  description: `UTC schedule and behavior for RootRecord treasury Raydium LP maintenance (${ECOSYSTEM_LISTING_SYMBOL}): native SOL floor checks and RRTT/RRESERVE inventory floors.`,
  keywords: [
    ...SEO_KEYWORDS.core,
    ECOSYSTEM_LISTING_SYMBOL,
    'treasury',
    'Raydium CPMM',
    'liquidity automation',
    'schedule',
  ],
});

export default function LiquidityTimingLayout({ children }: { children: ReactNode }) {
  return children;
}
