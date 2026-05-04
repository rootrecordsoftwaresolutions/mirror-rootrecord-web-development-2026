/** Sidebar + index for `/operations` wiki (program docs, on-chain context, product guides). */
export type OperationsWikiPage = {
  href: string;
  label: string;
  description: string;
};

export const OPERATIONS_WIKI_PAGES: readonly OperationsWikiPage[] = [
  {
    href: '/operations',
    label: 'Overview',
    description: 'How this wiki is organized and what to read first.',
  },
  {
    href: '/operations/docs',
    label: 'Documentation',
    description: 'Wallet setup, create & manage tokens, referrals, paper wallets, and hosted rewards.',
  },
  {
    href: '/operations/ecosystem',
    label: 'Ecosystem',
    description: 'Listing mint, treasury, Raydium CPMM pool accounts — Solscan links.',
  },
  {
    href: '/operations/liquidity-timing',
    label: 'Liquidity timing',
    description: 'UTC cadence for treasury Raydium maintenance and SPL floor checks.',
  },
  {
    href: '/operations/tokenomics',
    label: 'Tokenomics & markets',
    description: 'Pools, supply, fees, automation, and how to read multi-pool context.',
  },
] as const;
