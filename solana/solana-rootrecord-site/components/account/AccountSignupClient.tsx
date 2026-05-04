'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { portalSignup } from '@/lib/portalAccountApi';
import {
  getOrCreateDeviceId,
  getRootRecordApiBase,
  notifyPortalAuthChange,
  setPortalToken,
  syncPortalLifetimeFromMe,
} from '@/lib/rootrecordSession';

export function AccountSignupClient() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ msg: string; kind: 'ok' | 'warn' | 'err' | '' }>({ msg: '', kind: '' });
  const hasApi = Boolean(getRootRecordApiBase());

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ msg: '', kind: '' });
    if (!hasApi) {
      setStatus({ msg: 'Creating an account is not available here yet. Set NEXT_PUBLIC_ROOTRECORD_API_BASE.', kind: 'warn' });
      return;
    }
    if (password.length < 10) {
      setStatus({ msg: 'Password must be at least 10 characters.', kind: 'err' });
      return;
    }
    setBusy(true);
    try {
      const r = await portalSignup(email, password, getOrCreateDeviceId());
      if (!r.ok) {
        setStatus({ msg: r.detail, kind: 'err' });
        return;
      }
      setPortalToken(r.access_token);
      syncPortalLifetimeFromMe(null);
      notifyPortalAuthChange();
      toast.success('Account created');
      router.push('/account');
      router.refresh();
    } catch (err) {
      const net = err instanceof Error ? err.message : '';
      setStatus(
        {
          msg:
            net && /network|fetch|failed|load/i.test(net)
              ? 'Could not reach the account service. Check your connection or try again in a moment.'
              : 'Something went wrong. Please try again.',
          kind: 'err',
        },
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container py-8 md:py-12 max-w-2xl">
      <div className="mb-8 space-y-2">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          <Link href="/account" className="text-sol-green hover:underline">
            Account
          </Link>{' '}
          / Sign up
        </p>
        <h1 className="font-display text-3xl md:text-4xl tracking-tight text-foreground">
          Create your <em className="not-italic text-sol-green">account</em>.
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Use the same credentials in RootRecord apps where sign-in is supported.
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
            Account API is not configured. Add <code className="text-xs">NEXT_PUBLIC_ROOTRECORD_API_BASE</code>.
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border bg-ink-800/40">
          <CardContent className="pt-6 space-y-6">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Choose an email and a password (at least 10 characters). You can sign in on{' '}
              <Link href="/account" className="text-sol-green hover:underline">
                Account
              </Link>{' '}
              afterward.
            </p>
            <h2 className="text-lg font-semibold text-foreground">Sign up</h2>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="portal-signup-email">Email</Label>
                <Input
                  id="portal-signup-email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="font-mono text-sm"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="portal-signup-password">Password</Label>
                <Input
                  id="portal-signup-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={10}
                  required
                />
              </div>
              <Button type="submit" disabled={busy}>
                {busy ? 'Creating…' : 'Create account'}
              </Button>
            </form>
            <p className="text-sm text-muted-foreground">
              Already registered?{' '}
              <Link href="/account" className="text-sol-green hover:underline font-medium">
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
