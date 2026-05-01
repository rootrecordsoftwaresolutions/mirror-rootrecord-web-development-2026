'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  fetchEarnSummary,
  fetchPortalMe,
  formatAccountCreatedAt,
  planLabelFromMe,
  portalDeleteAccount,
  portalLogout,
  type EarnSummary,
  type PortalMeData,
} from '@/lib/portalAccountApi';
import { portalAbsoluteUrl } from '@/lib/rootrecordPortal';
import {
  clearPortalSession,
  getPortalToken,
  getRootRecordApiBase,
  rootrecordLogin,
  syncPortalLifetimeFromMe,
} from '@/lib/rootrecordSession';

type Phase = 'loading' | 'forms' | 'account';

function subscriptionLine(data: PortalMeData): { text: string; showBillingLink: boolean } {
  const label = planLabelFromMe(data);
  if (data.life_member || data.lifeMember) return { text: label, showBillingLink: false };
  const v = String(data.subscription_status || '').toLowerCase();
  if (v === 'none' || !v) {
    if (data.pro_unlocked || data.proUnlocked) return { text: label, showBillingLink: false };
    return { text: `${label} — Become a Member`, showBillingLink: true };
  }
  return { text: label, showBillingLink: false };
}

function rewardsLine(earn: EarnSummary | null): ReactNode {
  const learn = (
    <a
      href={portalAbsoluteUrl('/beta-tester-rewards.html')}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sol-green hover:underline"
    >
      Learn more
    </a>
  );
  if (!earn) {
    return (
      <>
        — {learn}
      </>
    );
  }
  const n = Math.max(0, Math.floor(earn.balance));
  return (
    <>
      <strong className="tabular-nums text-foreground">{n.toLocaleString()}</strong> {learn}
    </>
  );
}

function DetailRow({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,14rem)_1fr] gap-1 sm:gap-4 py-3 border-b border-border/80 last:border-0 text-sm">
      <span className="text-muted-foreground font-medium">{k}</span>
      <div className="text-foreground min-w-0 break-words">{children}</div>
    </div>
  );
}

export function AccountPageClient() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [status, setStatus] = useState<{ msg: string; kind: 'ok' | 'warn' | 'err' | '' }>({ msg: '', kind: '' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [me, setMe] = useState<PortalMeData | null>(null);
  const [earn, setEarn] = useState<EarnSummary | null>(null);
  const hasApi = Boolean(getRootRecordApiBase());

  const applyStatus = (msg: string, kind: 'ok' | 'warn' | 'err' | '') => {
    setStatus({ msg, kind });
  };

  const loadAccount = useCallback(async () => {
    const token = getPortalToken();
    if (!token || !hasApi) {
      syncPortalLifetimeFromMe(null);
      setPhase('forms');
      return;
    }
    setPhase('loading');
    applyStatus('', '');
    const r = await fetchPortalMe(token);
    if (r.ok === false && r.status === 401) {
      clearPortalSession();
      syncPortalLifetimeFromMe(null);
      applyStatus('Your session ended. Please sign in again.', 'warn');
      setPhase('forms');
      return;
    }
    if (r.ok === false) {
      setMe(null);
      setEarn(null);
      setPhase('account');
      applyStatus('We could not load your account. Please try again in a moment.', 'err');
      return;
    }
    const e = await fetchEarnSummary(token);
    setMe(r.data);
    setEarn(e);
    syncPortalLifetimeFromMe(r.data);
    setPhase('account');
  }, [hasApi]);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    applyStatus('', '');
    if (!hasApi) {
      applyStatus('Sign-in is not available here yet. Set NEXT_PUBLIC_ROOTRECORD_API_BASE.', 'warn');
      return;
    }
    setBusy(true);
    try {
      const r = await rootrecordLogin(email, password);
      if (!r.ok) {
        applyStatus(r.detail || 'Sign-in did not work. Check your email and password.', 'err');
        return;
      }
      toast.success('Signed in');
      setPassword('');
      await loadAccount();
    } catch (err) {
      const net = err instanceof Error ? err.message : '';
      applyStatus(
        net && /network|fetch|failed|load/i.test(net)
          ? 'Could not reach the sign-in service. Check your connection or try again in a moment.'
          : 'Something went wrong. Please try again.',
        'err',
      );
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    const token = getPortalToken();
    if (token && hasApi) await portalLogout(token);
    clearPortalSession();
    syncPortalLifetimeFromMe(null);
    setMe(null);
    setEarn(null);
    setPhase('forms');
    applyStatus('You are signed out.', 'ok');
    toast.message('Signed out');
  }

  async function onDeleteAccount() {
    const token = getPortalToken();
    if (!token) {
      applyStatus('You are not signed in.', 'warn');
      setPhase('forms');
      return;
    }
    if (!hasApi) {
      applyStatus('Account service is unavailable here.', 'warn');
      return;
    }
    const ok1 = window.confirm(
      'Delete your RootRecord account?\n\nThis permanently deletes your portal account and any server-stored data tied to it. This cannot be undone.',
    );
    if (!ok1) return;
    const typed = window.prompt('Type DELETE to confirm account deletion.');
    if (String(typed || '').trim().toUpperCase() !== 'DELETE') {
      applyStatus('Account deletion canceled.', 'warn');
      return;
    }
    setBusy(true);
    applyStatus('Deleting your account…', '');
    const r = await portalDeleteAccount(token);
    setBusy(false);
    if (!r.ok) {
      applyStatus(r.detail, 'err');
      return;
    }
    clearPortalSession();
    syncPortalLifetimeFromMe(null);
    setMe(null);
    setEarn(null);
    setPhase('forms');
    applyStatus('Your account was deleted.', 'ok');
    toast.success('Account deleted');
  }

  const sub = me ? subscriptionLine(me) : { text: '', showBillingLink: false };

  return (
    <div className="container py-8 md:py-12 max-w-2xl">
      <div className="mb-8 space-y-2">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Account</p>
        <h1 className="font-display text-3xl md:text-4xl tracking-tight text-foreground">
          Your <em className="not-italic text-sol-green">account</em>.
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Sign in for subscription status and billing. Same email and password as rootrecord.info — one account for
          RootRecord apps and Solana Tools (including custodial wallet when enabled).
        </p>
      </div>

      {status.msg ? (
        <p
          role="status"
          className={`mb-4 text-sm rounded-lg px-3 py-2 ${
            status.kind === 'err'
              ? 'bg-destructive/15 text-destructive'
              : status.kind === 'warn'
                ? 'bg-amber-500/10 text-amber-200'
                : status.kind === 'ok'
                  ? 'bg-sol-green/10 text-sol-green'
                  : 'text-muted-foreground'
          }`}
        >
          {status.msg}
        </p>
      ) : null}

      {!hasApi ? (
        <Card className="border-border bg-ink-800/40">
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Account API is not configured. Add{' '}
            <code className="text-xs text-foreground/90">NEXT_PUBLIC_ROOTRECORD_API_BASE</code> (same as production
            portal, e.g. <code className="text-xs">https://api.rootrecord.info</code>) to enable sign-in here.
          </CardContent>
        </Card>
      ) : null}

      {phase === 'loading' && hasApi ? (
        <Card className="border-border bg-ink-800/40">
          <CardContent className="pt-6 text-sm text-muted-foreground">Loading…</CardContent>
        </Card>
      ) : null}

      {phase === 'forms' && hasApi ? (
        <Card className="border-border bg-ink-800/40">
          <CardContent className="pt-6 space-y-6">
            <h2 className="text-lg font-semibold text-foreground">Sign in</h2>
            <form onSubmit={onLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="portal-login-email">Email</Label>
                <Input
                  id="portal-login-email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="font-mono text-sm"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="portal-login-password">Password</Label>
                <Input
                  id="portal-login-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" disabled={busy} className="w-full sm:w-auto">
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
            <div className="pt-2">
              <Button asChild type="button" variant="outline" className="w-full sm:w-auto">
                <Link href="/account/signup">Create an account</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {phase === 'account' && me ? (
        <div className="space-y-6">
          <Card className="border-border bg-ink-800/40">
            <CardContent className="pt-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Your account</h2>
              <div className="divide-y divide-border/60 rounded-lg border border-border/80 bg-background/30 px-4">
                <DetailRow k="Email">{String(me.email || '—')}</DetailRow>
                <DetailRow k="Your RootRecord ID">{String(me.account_id || '—')}</DetailRow>
                <DetailRow k="Account created">{formatAccountCreatedAt(me)}</DetailRow>
                <DetailRow k="Subscription">
                  {sub.showBillingLink ? (
                    <>
                      Free —{' '}
                      <a
                        href={portalAbsoluteUrl('/billing.html')}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sol-green hover:underline"
                      >
                        Become a Member
                      </a>
                    </>
                  ) : (
                    sub.text
                  )}
                </DetailRow>
                <DetailRow k="Password on file">{me.has_password ? 'Yes' : 'No'}</DetailRow>
                <DetailRow k="Beta tester rewards">{rewardsLine(earn)}</DetailRow>
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="pt-6 space-y-3">
              <h3 className="text-base font-semibold text-foreground">Danger zone</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Deleting your account permanently removes your RootRecord portal profile and any server-stored data tied
                to it (saved locations, notifications).
              </p>
              <Button type="button" variant="outline" disabled={busy} onClick={() => void onDeleteAccount()}>
                Delete account
              </Button>
            </CardContent>
          </Card>

          <Button type="button" variant="outline" disabled={busy} onClick={() => void onLogout()}>
            Sign out
          </Button>
        </div>
      ) : null}
    </div>
  );
}
