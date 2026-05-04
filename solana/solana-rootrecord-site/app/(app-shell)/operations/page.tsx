import type { Metadata } from 'next';
import Link from 'next/link';

import { OPERATIONS_WIKI_PAGES } from '@/lib/operationsWikiNav';
import { pageSeo, SEO_KEYWORDS } from '@/lib/seo';

export const metadata: Metadata = pageSeo({
  path: '/operations',
  title: 'Operations wiki',
  description:
    'RootRecord Solana Tools — documentation, ecosystem accounts, liquidity automation schedule, and tokenomics in one wiki-style index.',
  keywords: [...SEO_KEYWORDS.core, 'RootRecord', 'documentation', 'treasury', 'tokenomics'],
});

export default function OperationsIndexPage() {
  const articles = OPERATIONS_WIKI_PAGES.filter((p) => p.href !== '/operations');

  return (
    <div className="space-y-12">
      <header className="space-y-4 border-b border-border/60 pb-10">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Wiki</div>
        <h1 className="font-display text-4xl md:text-5xl tracking-tight">Operations</h1>
        <p className="max-w-2xl text-muted-foreground leading-relaxed">
          How the product works, how treasury and pools show up on-chain, and where to verify claims in
          a block explorer. Pick a page from the tree — the same list stays in the sidebar on desktop
          and in the menu on mobile.
        </p>
      </header>

      <section aria-labelledby="wiki-tree-heading" className="space-y-4">
        <h2 id="wiki-tree-heading" className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Contents
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {articles.map((p) => (
            <li key={p.href}>
              <Link
                href={p.href}
                className="block rounded-xl border border-border/80 bg-ink-950/40 p-4 transition-colors hover:border-sol-green/35 hover:bg-sol-green/5"
              >
                <span className="font-medium text-foreground">{p.label}</span>
                <span className="mt-2 block text-sm text-muted-foreground leading-snug">{p.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
