'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { ToolDialog, type ToolKind } from '@/components/tools/ToolDialog';
import { TOOL_CATALOG } from '@/lib/toolsCatalog';

const TOOL_KINDS_FROM_CATALOG = new Set<ToolKind>(
  TOOL_CATALOG.flatMap((e) => ('kind' in e ? [e.kind] : [])),
);

function ToolsInner() {
  const params = useSearchParams();
  const [active, setActive] = useState<ToolKind | null>(null);
  const [initialMint, setInitialMint] = useState<string | undefined>();

  const actionParam = params.get('action');
  const toolParam = params.get('tool')?.trim() || '';
  const mintParam = params.get('mint')?.trim() || '';

  useEffect(() => {
    if (toolParam && TOOL_KINDS_FROM_CATALOG.has(toolParam as ToolKind)) {
      setActive(toolParam as ToolKind);
      setInitialMint(mintParam || undefined);
      return;
    }
    if (actionParam === 'mint') {
      setActive('mint-more');
      setInitialMint(mintParam || undefined);
    } else if (actionParam === 'burn') {
      setActive('burn-tokens');
      setInitialMint(mintParam || undefined);
    }
  }, [actionParam, mintParam, toolParam]);

  return (
    <div className="container py-14 md:py-20">
      <div className="max-w-3xl">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">
          02 / Tools
        </div>
        <h1 className="font-display text-4xl md:text-6xl tracking-tight">
          Manage your token like an{' '}
          <em className="italic text-sol-purple">operator</em>.
        </h1>
        <p className="mt-5 text-muted-foreground max-w-2xl">
          Standalone, on-chain actions you might run before, during, or after a
          launch. Most tools are one signed transaction; bulk sends and Raydium
          liquidity flows may batch or chain as required.
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          Short wallet home:{' '}
          <Link href="/dashboard" className="text-sol-green hover:underline font-medium">
            Hub
          </Link>
          .
        </p>
      </div>

      <div className="mt-12 grid gap-5 md:grid-cols-2">
        {TOOL_CATALOG.map((t, i) => {
          const isLink = 'href' in t;
          const key = isLink ? t.href : t.kind;
          const testId = isLink
            ? `tool-card-${t.href.replace(/^\//, '').replace(/\//g, '-')}`
            : `tool-card-${t.kind}`;
          const cardClassName =
            'group h-full transition-all hover:-translate-y-1 hover:border-sol-green/40 hover:shadow-[0_0_40px_-12px_rgba(20,241,149,0.25)]' +
            (isLink ? '' : ' cursor-pointer');

          const inner = (
            <>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <span className="text-xs font-mono text-sol-green/80 tracking-widest">
                    {(i + 1).toString().padStart(2, '0')} /
                  </span>
                  <div className="flex items-center gap-2">
                    {t.t2022 && (
                      <span className="text-[10px] uppercase tracking-[0.14em] rounded-full px-2 py-0.5 border border-sol-purple/40 bg-sol-purple/10 text-sol-purple">
                        Token-2022
                      </span>
                    )}
                    <t.icon
                      className={
                        'h-5 w-5 transition-colors ' +
                        (t.tone === 'green'
                          ? 'text-muted-foreground group-hover:text-sol-green'
                          : 'text-muted-foreground group-hover:text-sol-purple')
                      }
                    />
                  </div>
                </div>
                <CardTitle className="mt-4">{t.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="leading-relaxed">
                  {t.desc}
                </CardDescription>
                <div className="mt-5">
                  {isLink ? (
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-sol-green">
                      Open tool <ArrowRight className="h-4 w-4" />
                    </span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-0 hover:bg-transparent text-sol-green"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActive(t.kind);
                        setInitialMint(undefined);
                      }}
                    >
                      Open tool <ArrowRight className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </>
          );

          if (isLink) {
            return (
              <Link
                key={key}
                href={t.href}
                data-testid={testId}
                className="block rounded-xl text-inherit no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sol-green/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Card className={`${cardClassName} cursor-pointer`}>{inner}</Card>
              </Link>
            );
          }

          return (
            <Card
              key={key}
              data-testid={testId}
              className={cardClassName}
              onClick={() => {
                setActive(t.kind);
                setInitialMint(undefined);
              }}
            >
              {inner}
            </Card>
          );
        })}
      </div>

      <ToolDialog
        kind={active}
        initialMint={initialMint}
        onClose={() => setActive(null)}
      />
    </div>
  );
}

export default function ToolsPage() {
  return (
    <Suspense fallback={<div className="container py-20" />}>
      <ToolsInner />
    </Suspense>
  );
}
