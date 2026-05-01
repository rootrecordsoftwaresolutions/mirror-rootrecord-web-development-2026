'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { portalLogout } from '@/lib/portalAccountApi';
import { portalAbsoluteUrl } from '@/lib/rootrecordPortal';
import {
  clearPortalSession,
  getPortalToken,
  getRootRecordApiBase,
  PORTAL_LIFETIME_NAV_KEY,
  syncPortalLifetimeFromMe,
} from '@/lib/rootrecordSession';

function menuItemClass() {
  return cn(
    'block w-full rounded-md px-3 py-2 text-left text-sm text-foreground',
    'hover:bg-white/5 focus:bg-white/5 focus:outline-none',
  );
}

export function RootRecordPortalNav() {
  const [signedIn, setSignedIn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hideBilling, setHideBilling] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const syncSignedIn = useCallback(() => {
    setSignedIn(Boolean(getPortalToken()));
  }, []);

  const syncLifetime = useCallback(() => {
    if (typeof window === 'undefined') return;
    setHideBilling(localStorage.getItem(PORTAL_LIFETIME_NAV_KEY) === '1');
  }, []);

  const refreshMeForLifetime = useCallback(async () => {
    const token = getPortalToken();
    const base = getRootRecordApiBase();
    if (!token || !base) {
      syncPortalLifetimeFromMe(null);
      setHideBilling(false);
      return;
    }
    try {
      const res = await fetch(`${base}/v1/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        clearPortalSession();
        setHideBilling(false);
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as Record<string, unknown>;
      syncPortalLifetimeFromMe(data);
      setHideBilling(Boolean(data.life_member || data.lifeMember));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    syncSignedIn();
    syncLifetime();
    const onStorage = () => {
      syncSignedIn();
      syncLifetime();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('rootrecord-portal-auth-change', syncSignedIn);
    window.addEventListener('rootrecord-portal-lifetime-nav-change', syncLifetime);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('rootrecord-portal-auth-change', syncSignedIn);
      window.removeEventListener('rootrecord-portal-lifetime-nav-change', syncLifetime);
    };
  }, [syncSignedIn, syncLifetime]);

  useEffect(() => {
    if (signedIn) void refreshMeForLifetime();
  }, [signedIn, refreshMeForLifetime]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  if (signedIn) {
    return (
      <div ref={wrapRef} className="relative shrink-0">
        <Button
          type="button"
          size="sm"
          className="h-8 bg-sol-green text-black font-semibold hover:bg-sol-green/90 shadow-[0_0_0_1px_rgba(20,241,149,0.35)] px-3"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          data-testid="nav-account-cta"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((o) => !o);
          }}
        >
          Account
        </Button>
        {menuOpen ? (
          <div
            role="menu"
            className="absolute right-0 top-[calc(100%+0.35rem)] z-50 min-w-[11.5rem] rounded-xl border border-border bg-ink-800 py-1 px-1 shadow-lg"
          >
            <Link href="/account" role="menuitem" className={menuItemClass()} onClick={closeMenu}>
              Account
            </Link>
            <a
              href={portalAbsoluteUrl('/my-apps.html')}
              role="menuitem"
              className={menuItemClass()}
              target="_blank"
              rel="noopener noreferrer"
              onClick={closeMenu}
            >
              My Apps
            </a>
            <a
              href={portalAbsoluteUrl('/development-notice.html')}
              role="menuitem"
              className={menuItemClass()}
              target="_blank"
              rel="noopener noreferrer"
              onClick={closeMenu}
            >
              Development notice
            </a>
            {!hideBilling ? (
              <a
                href={portalAbsoluteUrl('/billing.html')}
                role="menuitem"
                className={menuItemClass()}
                target="_blank"
                rel="noopener noreferrer"
                onClick={closeMenu}
              >
                Billing
              </a>
            ) : null}
            <a
              href={portalAbsoluteUrl('/beta-tester-rewards.html')}
              role="menuitem"
              className={menuItemClass()}
              target="_blank"
              rel="noopener noreferrer"
              onClick={closeMenu}
            >
              Beta tester rewards
            </a>
            <button
              type="button"
              role="menuitem"
              className={cn(menuItemClass(), 'text-muted-foreground')}
              onClick={() => {
                const t = getPortalToken();
                void (async () => {
                  if (t && getRootRecordApiBase()) await portalLogout(t);
                  clearPortalSession();
                  closeMenu();
                })();
              }}
            >
              Sign out
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 shrink-0" data-testid="nav-auth-guest">
      <Button
        asChild
        size="sm"
        variant="outline"
        className="h-8 border-sol-green/40 text-sol-green hover:bg-sol-green/10 hover:text-sol-green px-2.5 sm:px-3"
      >
        <Link href="/account/signup" data-testid="nav-signup-cta">
          Sign up
        </Link>
      </Button>
      <Button asChild size="sm" className="h-8 bg-sol-green text-black font-semibold hover:bg-sol-green/90 px-2.5 sm:px-3">
        <Link href="/account" data-testid="nav-account-login">
          Account
        </Link>
      </Button>
    </div>
  );
}
