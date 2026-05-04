import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import {
  ECOSYSTEM_LISTING_NAME,
  ECOSYSTEM_LISTING_SYMBOL,
} from '@/lib/ecosystemOtcConstants';
import { pageSeo, SEO_KEYWORDS } from '@/lib/seo';

export const metadata: Metadata = pageSeo({
  path: '/ecosystem',
  title: `Ecosystem — ${ECOSYSTEM_LISTING_SYMBOL}`,
  description: `${ECOSYSTEM_LISTING_NAME} (${ECOSYSTEM_LISTING_SYMBOL}): treasury balance context, Raydium CPMM pool links, and how RootRecord ties listing liquidity to on-chain operations.`,
  keywords: [
    ...SEO_KEYWORDS.core,
    ECOSYSTEM_LISTING_SYMBOL,
    ECOSYSTEM_LISTING_NAME,
    'treasury',
    'Raydium CPMM',
  ],
});

export default function EcosystemLayout({ children }: { children: ReactNode }) {
  return children;
}
