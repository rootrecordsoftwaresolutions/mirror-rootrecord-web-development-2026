import type { Metadata } from 'next';

import { pageSeo, SEO_KEYWORDS } from '@/lib/seo';

export const metadata: Metadata = pageSeo({
  path: '/tools',
  title: 'Manage Solana tokens',
  description:
    'On-chain tools: revoke mint or freeze authority, bulk freeze or thaw up to 100 holder ATAs (toggle; no RootRecord fee while waived), mint more supply, update Metaplex metadata, Token-2022 transfer fee withdraw and harvest, Raydium CPMM pool helpers, and more. Flat SOL tool fees where applicable.',
  keywords: [
    ...SEO_KEYWORDS.core,
    'revoke freeze authority',
    'bulk freeze thaw SPL token accounts',
    'update token metadata',
    'withdraw transfer fee',
    'Token-2022 fees',
    'burn SPL tokens',
  ],
});

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
