'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { Menu } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DASHBOARD_HUB_ANCHORS,
  DASHBOARD_SHELL_NAV,
} from '@/lib/dashboardShellNav';
import { cn } from '@/lib/utils';

function routeActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  if (pathname === href) return true;
  if (href !== '/' && pathname.startsWith(`${href}/`)) return true;
  return false;
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || '';
  const { connected } = useWallet();
  const [sheetOpen, setSheetOpen] = useState(false);

  const onHub = pathname === '/dashboard';

  const NavBody = ({ onPick }: { onPick?: () => void }) => (
    <div className="flex flex-col gap-6 p-3">
      {DASHBOARD_SHELL_NAV.map((group) => (
        <div key={group.heading}>
          <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/90">
            {group.heading}
          </div>
          <div className="flex flex-col gap-0.5">
            {group.items
              .filter((item) => item.href !== '/my-actions' || connected)
              .map((item) => {
                const active = routeActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onPick}
                    className={cn(
                      'rounded-lg px-3 py-2 text-sm transition-colors',
                      active
                        ? 'bg-white/10 font-medium text-sol-green'
                        : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
          </div>
          {group.heading === 'Overview' && onHub ? (
            <div className="mt-2 border-t border-border/60 pt-2">
              <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
                On this page
              </div>
              <div className="flex flex-col gap-0.5">
                {DASHBOARD_HUB_ANCHORS.map((a) => (
                  <Link
                    key={a.hash}
                    href={`/dashboard#${a.hash}`}
                    onClick={onPick}
                    className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  >
                    {a.label}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex min-h-0 w-full max-w-full flex-1 flex-col bg-background lg:min-h-[calc(100vh-4rem)] lg:flex-row">
      {/* Desktop sidebar */}
      <aside
        className="hidden w-[min(17rem,100%)] shrink-0 flex-col border-b border-border/60 bg-[#05080a] lg:flex lg:min-h-0 lg:border-b-0 lg:border-r lg:border-border/60"
        aria-label="App navigation"
      >
        <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-2" aria-label="Dashboard sections">
          <NavBody />
        </nav>
      </aside>

      {/* Mobile: open full nav (brand lives in site header only) */}
      <div className="flex items-center justify-end gap-2 border-b border-border/60 bg-[#05080a] px-3 py-2 lg:hidden">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 border-border bg-ink-900/80"
          aria-label="Open navigation"
          onClick={() => setSheetOpen(true)}
        >
          <Menu className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent className="max-h-[85vh] max-w-md gap-0 overflow-hidden border-border bg-ink-900 p-0 sm:max-w-md">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle>Navigation</DialogTitle>
            <DialogDescription className="text-xs">All tools stay in this shell.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[min(70vh,28rem)] overflow-y-auto">
            <NavBody onPick={() => setSheetOpen(false)} />
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-gradient-to-b from-background to-ink-950/35">
        <div className="shrink-0 border-b border-border bg-ink-950/80 px-3 py-2 text-center text-[11px] text-muted-foreground sm:text-xs">
          Verify you are on{' '}
          <span className="font-mono text-sol-green">solana.rootrecord.info</span>
          {' — '}bookmark the official site.
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">{children}</div>
      </div>
    </div>
  );
}
