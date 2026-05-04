import type { Metadata } from 'next';

import { DashboardWelcome } from '@/components/dashboard/DashboardWelcome';
import { pageSeo, SEO_KEYWORDS } from '@/lib/seo';

export const metadata: Metadata = pageSeo({
  path: '/dashboard',
  title: 'Hub',
  description:
    'Solana Tools home: wallet snapshot, hosted account hint, and links to create and tools. Sidebar lists every tool on other pages; Hub keeps a short layout.',
  keywords: [...SEO_KEYWORDS.core, 'Solana dashboard', 'wallet'],
});

export default function DashboardPage() {
  return <DashboardWelcome />;
}
