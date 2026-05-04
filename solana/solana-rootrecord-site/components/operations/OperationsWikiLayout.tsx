'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, ChevronRight, Menu } from 'lucide-react';

import { OPERATIONS_WIKI_PAGES } from '@/lib/operationsWikiNav';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function NavLinks({
  onPick,
  className,
}: {
  onPick?: () => void;
  className?: string;
}) {
  const pathname = usePathname() || '';
  return (
    <nav className={cn('flex flex-col gap-0.5', className)} aria-label="Operations wiki">
      {OPERATIONS_WIKI_PAGES.map((p) => {
        const active =
          p.href === '/operations'
            ? pathname === '/operations'
            : pathname === p.href || pathname.startsWith(`${p.href}/`);
        return (
          <Link
            key={p.href}
            href={p.href}
            onClick={onPick}
            className={cn(
              'group rounded-lg border border-transparent px-3 py-2.5 text-left transition-colors',
              active
                ? 'border-sol-green/25 bg-sol-green/10 text-foreground'
                : 'text-muted-foreground hover:border-border hover:bg-white/5 hover:text-foreground',
            )}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <ChevronRight
                className={cn(
                  'h-3.5 w-3.5 shrink-0 transition-transform',
                  active ? 'text-sol-green rotate-90' : 'text-muted-foreground opacity-60',
                )}
                aria-hidden
              />
              {p.label}
            </span>
            <span className="mt-1 block ps-7 text-xs leading-snug text-muted-foreground group-hover:text-muted-foreground/90">
              {p.description}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export function OperationsWikiLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col lg:flex-row">
      {/* Mobile wiki menu */}
      <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-ink-950/50 px-3 py-2.5 lg:hidden">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
          <BookOpen className="h-4 w-4 shrink-0 text-sol-green" aria-hidden />
          <span className="truncate">Operations wiki</span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 border-border bg-ink-900/80"
          aria-label="Open wiki contents"
          onClick={() => setOpen(true)}
        >
          <Menu className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-md gap-0 overflow-hidden border-border bg-ink-900 p-0 sm:max-w-md">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle>Operations wiki</DialogTitle>
            <DialogDescription className="text-xs">Program docs and on-chain context.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[min(70vh,28rem)] overflow-y-auto p-3">
            <NavLinks onPick={() => setOpen(false)} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Desktop sidebar */}
      <aside
        className="hidden w-[min(19rem,100%)] shrink-0 border-b border-border/60 bg-ink-950/35 lg:block lg:border-b-0 lg:border-r lg:border-border/60"
        aria-label="Operations wiki navigation"
      >
        <div className="sticky top-0 max-h-[calc(100vh-5.5rem)] overflow-y-auto p-4">
          <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <BookOpen className="h-3.5 w-3.5 text-sol-green" aria-hidden />
            Operations
          </div>
          <NavLinks />
        </div>
      </aside>

      <div className="min-h-0 min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[min(100%,48rem)] px-4 py-8 sm:px-6 lg:max-w-[min(100%,56rem)] lg:py-10">
          {children}
        </div>
      </div>
    </div>
  );
}
