import type { Metadata } from 'next';
import Link from 'next/link';

import { LinearVestingClient } from '@/components/contracts/LinearVestingClient';
import { pageSeo, SEO_KEYWORDS } from '@/lib/seo';

export const metadata: Metadata = pageSeo({
  path: '/contracts/vesting',
  title: 'Linear vesting (Root Record)',
  description:
    'Roadmap for Root Record native SPL and Token-2022 vesting on Solana — linear schedules, cliffs, and treasury locks without third-party vesting protocols.',
  keywords: [
    ...SEO_KEYWORDS.core,
    'vesting',
    'token vesting',
    'SPL vesting',
    'Solana vesting',
    'treasury lock',
  ],
});

export default function ContractsVestingPage() {
  return (
    <div className="container py-14 md:py-20">
      <div className="max-w-3xl">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">
          <Link href="/contracts" className="hover:text-sol-green transition-colors">
            Contracts
          </Link>
          <span className="mx-2 text-border">/</span>
          Vesting
        </p>
        <h1 className="font-display text-4xl md:text-5xl tracking-tight">
          Linear <em className="italic text-sol-green">vesting</em>
        </h1>
        <p className="mt-4 text-muted-foreground leading-relaxed">
          Root Record is building native on-chain vesting for SPL and Token-2022 — no Streamflow or
          other external vesting integration. The live token toolkit stays on{' '}
          <Link href="/tools" className="text-sol-green hover:underline">
            Tools
          </Link>
          .
        </p>
      </div>

      <div className="mt-12 max-w-3xl">
        <LinearVestingClient />
      </div>
    </div>
  );
}
