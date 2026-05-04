import type { Metadata } from 'next';

import { DashboardWelcome } from '@/components/dashboard/DashboardWelcome';
import { pageSeo, SEO_KEYWORDS } from '@/lib/seo';

export const metadata: Metadata = pageSeo({
  path: '/dashboard',
  title: 'Dashboard',
  description:
    'Short Solana Tools home: wallet snapshot, hosted-wallet hint when signed in, and links to create and all tools. Full navigation lives in the sidebar.',
  keywords: [...SEO_KEYWORDS.core, 'Solana dashboard', 'wallet'],
});

export default function DashboardPage() {
  return <DashboardWelcome />;
}
