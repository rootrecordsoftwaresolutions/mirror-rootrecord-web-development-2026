'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  buildSolanaWalletLinkMessage,
  fetchEarnSummary,
  fetchPortalMe,
  fetchRewardsLedger,
  formatAccountCreatedAt,
  planLabelFromMe,
  portalCreateCustodialWallet,
  portalDeleteAccount,
  portalLinkWallet,
  portalLogout,
  portalSaveWithdrawDest,
  portalUnlinkWallet,
  type EarnSummary,
  type PortalMeData,
  type RewardsLedgerPage,
  type RewardsLedgerTransaction,
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

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]!);
  }
  return btoa(bin);
}

function linkedWalletFromMe(data: PortalMeData): string {
  const v = data.linked_wallet_pubkey;
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}

function linkedVerifiedFromMe(data: PortalMeData): string {
  const v = data.linked_wallet_verified_at;
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}

function formatLinkedVerifiedAt(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  try {
    return new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

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

function numEarn(earn: EarnSummary | null, k: string): number {
  if (!earn) return 0;
  const v = earn[k];
  return Math.max(0, Math.floor(Number(v) || 0));
}

function custodialPubFromMe(me: PortalMeData | null): string {
  const v = me?.custodial_wallet_pubkey;
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}

function solCachedLamports(me: PortalMeData | null): number | null {
  const v = me?.custodial_sol_lamports_cached;
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : null;
}

function rewardsLedgerKindLabel(row: RewardsLedgerTransaction): string {
  if (row.kind === 'treasury_to_custodial') return 'Treasury → custodial';
  if (row.kind === 'withdrawal_to_personal') return 'Custodial → personal wallet';
  return row.kind || 'Ledger entry';
}

function shortenPubkey(s: string): string {
  const t = s.trim();
  if (t.length <= 16) return t;
  return `${t.slice(0, 8)}…${t.slice(-6)}`;
}

function formatLedgerWhen(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso || '—';
  try {
    return new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function rewardsBlock(earn: EarnSummary | null): ReactNode {
  const learn = (
    <a
      href={portalAbsoluteUrl('/beta-tester-rewards.html')}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sol-green hover:underline font-medium"
    >
      Learn more
    </a>
  );
  if (!earn) {
    return (
      <p className="text-sm text-muted-foreground">
        Summary not loaded. Open the Weather Manager app while signed in, or try refreshing. {learn}
      </p>
    );
  }
  const total = Math.max(0, Math.floor(earn.balance));
  const pending = numEarn(earn, 'custodial_pending_units');
  const avail = numEarn(earn, 'custodial_available_withdraw_units');
  return (
    <div className="space-y-2">
      <p className="text-sm tabular-nums">
        <span className="text-muted-foreground">Total </span>
        <span className="font-semibold text-foreground">{total.toLocaleString()}</span>
        <span className="text-muted-foreground"> RRTT</span>
      </p>
      {pending > 0 ? (
        <p className="text-xs text-muted-foreground">
          Pending to custodial:{' '}
          <span className="tabular-nums font-medium text-amber-200/90">{pending.toLocaleString()}</span>
        </p>
      ) : null}
      {avail > 0 ? (
        <p className="text-xs text-muted-foreground">
          Available to withdraw:{' '}
          <span className="tabular-nums font-medium text-sol-green">{avail.toLocaleString()}</span>
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground leading-relaxed">
        Treasury sends RRTT to your custodial wallet on the daily schedule when enabled. {learn}
      </p>
    </div>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <span className="text-sm text-muted-foreground">{children}</span>;
}

function DetailRow({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-2 py-3.5 border-b border-border/60 last:border-0 sm:grid-cols-[11.5rem_minmax(0,1fr)] sm:items-start sm:gap-x-8 text-sm">
      <span className="text-muted-foreground font-medium leading-snug sm:pt-0.5">{k}</span>
      <div className="min-w-0 text-foreground leading-snug">{children}</div>
    </div>
  );
}

export function AccountPageClient() {
  const { publicKey, signMessage, connected } = useWallet();
  const [phase, setPhase] = useState<Phase>('loading');
  const [status, setStatus] = useState<{ msg: string; kind: 'ok' | 'warn' | 'err' | '' }>({ msg: '', kind: '' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [withdrawDraft, setWithdrawDraft] = useState('');
  const [me, setMe] = useState<PortalMeData | null>(null);
  const [earn, setEarn] = useState<EarnSummary | null>(null);
  const [ledger, setLedger] = useState<RewardsLedgerPage | null>(null);
  const [ledgerErr, setLedgerErr] = useState('');
  const [ledgerLoadingMore, setLedgerLoadingMore] = useState(false);
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
      setLedger(null);
      setLedgerErr('');
      applyStatus('Your session ended. Please sign in again.', 'warn');
      setPhase('forms');
      return;
    }
    if (r.ok === false) {
      setMe(null);
      setEarn(null);
      setLedger(null);
      setLedgerErr('');
      setPhase('account');
      applyStatus('We could not load your account. Please try again in a moment.', 'err');
      return;
    }
    const e = await fetchEarnSummary(token);
    setLedgerErr('');
    const lg = await fetchRewardsLedger(token, { limit: 100, offset: 0 });
    if (lg.ok) setLedger(lg.data);
    else {
      setLedger(null);
      if (lg.status !== 401) setLedgerErr(lg.detail);
    }
    setMe(r.data);
    setEarn(e);
    const wd = r.data?.withdraw_dest_pubkey;
    setWithdrawDraft(typeof wd === 'string' ? wd : '');
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
    setLedger(null);
    setLedgerErr('');
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
    setLedger(null);
    setLedgerErr('');
    setPhase('forms');
    applyStatus('Your account was deleted.', 'ok');
    toast.success('Account deleted');
  }

  async function onLinkWallet() {
    const token = getPortalToken();
    if (!token || !me) {
      applyStatus('You are not signed in.', 'warn');
      return;
    }
    if (!connected || !publicKey) {
      toast.error('Connect your wallet using the control in the site header, then try again.');
      return;
    }
    if (!signMessage) {
      toast.error('This wallet does not support message signing.');
      return;
    }
    const accountId = String(me.account_id || '').trim();
    if (!accountId) {
      applyStatus('Missing account id. Please refresh the page.', 'err');
      return;
    }
    setLinkBusy(true);
    applyStatus('', '');
    try {
      const message = buildSolanaWalletLinkMessage(accountId, publicKey.toBase58());
      const encoded = new TextEncoder().encode(message);
      const sigBytes = await signMessage(encoded);
      const signature = bytesToBase64(sigBytes);
      const r = await portalLinkWallet(token, {
        pubkey: publicKey.toBase58(),
        message,
        signature,
      });
      if (!r.ok) {
        if (r.status === 409) {
          toast.error(r.detail);
        } else {
          applyStatus(r.detail, 'err');
        }
        return;
      }
      toast.success('Wallet linked to your account');
      await loadAccount();
    } catch (err) {
      const net = err instanceof Error ? err.message : '';
      if (/User rejected|rejected request|cancel/i.test(net)) {
        toast.message('Signing canceled');
      } else {
        applyStatus(
          net && /network|fetch|failed|load/i.test(net)
            ? 'Could not reach the account service. Try again in a moment.'
            : 'Could not complete wallet link. Try again.',
          'err',
        );
      }
    } finally {
      setLinkBusy(false);
    }
  }

  async function onUnlinkWallet() {
    const token = getPortalToken();
    if (!token) {
      applyStatus('You are not signed in.', 'warn');
      return;
    }
    const ok = window.confirm('Remove the linked wallet from this RootRecord account?');
    if (!ok) return;
    setLinkBusy(true);
    applyStatus('', '');
    const r = await portalUnlinkWallet(token);
    setLinkBusy(false);
    if (!r.ok) {
      applyStatus(r.detail, 'err');
      return;
    }
    toast.success('Linked wallet removed');
    await loadAccount();
  }

  async function onGenerateCustodialWallet() {
    const token = getPortalToken();
    if (!token || !me) {
      applyStatus('You are not signed in.', 'warn');
      return;
    }
    setGenBusy(true);
    applyStatus('', '');
    const r = await portalCreateCustodialWallet(token);
    setGenBusy(false);
    if (!r.ok) {
      applyStatus(r.detail, 'err');
      return;
    }
    toast.success('Custodial wallet ready');
    await loadAccount();
  }

  async function onLoadMoreLedger() {
    const token = getPortalToken();
    if (!token || !ledger) return;
    const off = ledger.transactions.length;
    if (off >= ledger.total) return;
    setLedgerLoadingMore(true);
    try {
      const next = await fetchRewardsLedger(token, { limit: 100, offset: off });
      if (!next.ok) {
        toast.error(next.detail || 'Could not load more history.');
        return;
      }
      const seen = new Set(ledger.transactions.map((x) => x.id));
      const merged = [...ledger.transactions];
      for (const row of next.data.transactions) {
        if (!seen.has(row.id)) {
          seen.add(row.id);
          merged.push(row);
        }
      }
      setLedger({
        ...next.data,
        transactions: merged,
        offset: 0,
        total: next.data.total,
      });
    } finally {
      setLedgerLoadingMore(false);
    }
  }

  async function onSaveWithdrawDest() {
    const token = getPortalToken();
    if (!token) {
      applyStatus('You are not signed in.', 'warn');
      return;
    }
    setGenBusy(true);
    const trimmed = withdrawDraft.trim();
    const r = await portalSaveWithdrawDest(token, trimmed || null);
    setGenBusy(false);
    if (!r.ok) {
      applyStatus(r.detail, 'err');
      return;
    }
    toast.success('Withdrawal address saved');
    await loadAccount();
  }

  function onUseConnectedForWithdraw() {
    if (!publicKey) {
      toast.error('Connect a wallet in the header first');
      return;
    }
    setWithdrawDraft(publicKey.toBase58());
  }

  const sub = me ? subscriptionLine(me) : { text: '', showBillingLink: false };
  const linkedPk = me ? linkedWalletFromMe(me) : '';
  const linkedVerified = me ? linkedVerifiedFromMe(me) : '';
  const connectedPk = publicKey?.toBase58() ?? '';
  const linkedMatchesConnected = Boolean(linkedPk && connectedPk && linkedPk === connectedPk);
  const custodialPk = custodialPubFromMe(me);
  const solLamports = solCachedLamports(me);
  const solSol = solLamports != null ? solLamports / 1e9 : null;

  return (
    <div className="container py-8 md:py-12 max-w-4xl">
      <div className="mb-8 space-y-2">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Account</p>
        <h1 className="font-display text-3xl md:text-4xl tracking-tight text-foreground">
          Your <em className="not-italic text-sol-green">account</em>.
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
          Same email and password as rootrecord.info — subscription, RRTT rewards, custodial wallet, and linked Solana
          address in one place.
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
              <div className="rounded-xl border border-border/70 bg-background/40 px-3 sm:px-5">
                <DetailRow k="Email">{String(me.email || '—')}</DetailRow>
                <DetailRow k="Your RootRecord ID">
                  <span className="font-mono text-xs break-all">{String(me.account_id || '—')}</span>
                </DetailRow>
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
                <DetailRow k="Custodial web wallet">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0 flex-1 space-y-1">
                      {custodialPk ? (
                        <p className="font-mono text-xs break-all text-foreground/95">{custodialPk}</p>
                      ) : (
                        <EmptyLine>No wallet yet — create one to hold RRTT and sign on the web.</EmptyLine>
                      )}
                      {custodialPk ? (
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Used for RRTT rewards and optional RootRecord web signing.
                        </p>
                      ) : null}
                    </div>
                    {!custodialPk ? (
                      <Button
                        type="button"
                        size="sm"
                        className="shrink-0 self-start sm:self-center"
                        disabled={busy || linkBusy || genBusy}
                        onClick={() => void onGenerateCustodialWallet()}
                      >
                        {genBusy ? 'Creating…' : 'Generate wallet'}
                      </Button>
                    ) : null}
                  </div>
                </DetailRow>
                <DetailRow k="SOL (custodial, cached)">
                  {solSol != null ? (
                    <span className="tabular-nums text-foreground">
                      {solSol.toLocaleString(undefined, { maximumFractionDigits: 6 })} SOL
                    </span>
                  ) : (
                    <EmptyLine>Updates after the treasury sync runs.</EmptyLine>
                  )}
                </DetailRow>
                <DetailRow k="Linked wallet">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      {linkedPk ? (
                        <>
                          <p className="font-mono text-xs break-all text-foreground/95">{linkedPk}</p>
                          {linkedVerified ? (
                            <p className="text-xs text-muted-foreground">
                              Verified {formatLinkedVerifiedAt(linkedVerified)}
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <EmptyLine>Not linked — connect a header wallet and sign once to attach it.</EmptyLine>
                      )}
                      {linkedPk && connectedPk && !linkedMatchesConnected ? (
                        <p className="text-xs text-amber-200/90 leading-relaxed">
                          Header wallet ({connectedPk.slice(0, 4)}…{connectedPk.slice(-4)}) is not your linked wallet.
                          OTC uses the linked address.
                        </p>
                      ) : null}
                      {!connected && !linkedPk ? (
                        <p className="text-xs text-muted-foreground">Use the wallet control in the site header first.</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2 self-start sm:self-center sm:justify-end">
                      {linkedPk ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busy || linkBusy || genBusy}
                          onClick={() => void onUnlinkWallet()}
                        >
                          {linkBusy ? 'Working…' : 'Unlink'}
                        </Button>
                      ) : null}
                      {!linkedMatchesConnected ? (
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy || linkBusy || genBusy || !connected || !signMessage}
                          onClick={() => void onLinkWallet()}
                        >
                          {linkBusy
                            ? 'Confirm in wallet…'
                            : linkedPk
                              ? 'Link header instead'
                              : 'Link header wallet'}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </DetailRow>
                <DetailRow k="Beta tester rewards">{rewardsBlock(earn)}</DetailRow>
                <DetailRow k="Rewards & withdrawal history">
                  <div className="space-y-3 text-xs">
                    <details className="group text-muted-foreground">
                      <summary className="cursor-pointer text-xs hover:text-foreground [&::-webkit-details-marker]:hidden">
                        <span className="underline-offset-2 group-open:underline">What this table shows</span>
                      </summary>
                      <p className="mt-2 leading-relaxed pl-0.5 border-l-2 border-border/80 pl-3">
                        Treasury → custodial credits and transfers to your personal wallet, with per-app splits and
                        Solana tx links. Rows appear after each confirmed on-chain transfer.
                      </p>
                    </details>
                    {ledgerErr ? (
                      <p className="text-destructive text-xs">{ledgerErr}</p>
                    ) : !ledger || ledger.total === 0 ? (
                      <p className="text-muted-foreground">No ledger entries yet.</p>
                    ) : (
                      <>
                        <p className="text-muted-foreground">
                          Showing{' '}
                          <strong className="tabular-nums text-foreground">{ledger.transactions.length}</strong> of{' '}
                          <strong className="tabular-nums text-foreground">{ledger.total}</strong> entries
                          {ledger.solana_cluster ? (
                            <>
                              {' '}
                              <span className="opacity-80">({ledger.solana_cluster})</span>
                            </>
                          ) : null}
                          .
                        </p>
                        <div className="overflow-x-auto rounded-md border border-border/80 -mx-1">
                          <table className="w-full min-w-[720px] text-left border-collapse">
                            <thead>
                              <tr className="border-b border-border/80 bg-background/50 text-muted-foreground">
                                <th className="py-2 px-2 font-medium whitespace-nowrap">When</th>
                                <th className="py-2 px-2 font-medium">Type</th>
                                <th className="py-2 px-2 font-medium text-right whitespace-nowrap">RRTT</th>
                                <th className="py-2 px-2 font-medium min-w-[11rem]">From apps (this event)</th>
                                <th className="py-2 px-2 font-medium min-w-[9rem]">Tx hash</th>
                                <th className="py-2 px-2 font-medium min-w-[9rem]">To / receipt</th>
                              </tr>
                            </thead>
                            <tbody>
                              {ledger.transactions.map((row) => {
                                const txUrl =
                                  row.tx_signature && ledger.explorer_tx_base
                                    ? `${ledger.explorer_tx_base}${encodeURIComponent(row.tx_signature)}`
                                    : null;
                                const recv = row.recipient_pubkey?.trim();
                                const recvUrl = recv ? `https://solscan.io/account/${encodeURIComponent(recv)}` : null;
                                const att = row.app_snapshot.attributed_to_this_transfer;
                                const totals = row.app_snapshot.per_app_totals_at_transfer;
                                return (
                                  <tr key={row.id} className="border-b border-border/50 align-top last:border-0">
                                    <td className="py-2 px-2 text-muted-foreground whitespace-nowrap">
                                      {formatLedgerWhen(row.created_at)}
                                    </td>
                                    <td className="py-2 px-2">
                                      <div>{rewardsLedgerKindLabel(row)}</div>
                                      {row.kind === 'treasury_to_custodial' &&
                                      row.earn_balance_snapshot != null ? (
                                        <div className="text-muted-foreground mt-0.5">
                                          Earn balance snapshot:{' '}
                                          <span className="tabular-nums">{row.earn_balance_snapshot}</span>
                                        </div>
                                      ) : null}
                                    </td>
                                    <td className="py-2 px-2 text-right tabular-nums font-medium">
                                      {row.direction === 'out' ? '−' : '+'}
                                      {row.units.toLocaleString()}
                                    </td>
                                    <td className="py-2 px-2">
                                      {att.length ? (
                                        <ul className="list-disc pl-4 space-y-0.5">
                                          {att.map((a) => (
                                            <li key={a.app_id}>
                                              <span className="font-mono text-[11px] break-all">{a.app_id}</span>
                                              <span className="text-muted-foreground"> — </span>
                                              <span className="tabular-nums">{a.units.toLocaleString()}</span>
                                              <span className="text-muted-foreground"> units</span>
                                            </li>
                                          ))}
                                        </ul>
                                      ) : (
                                        <span className="text-muted-foreground">No per-app split recorded</span>
                                      )}
                                      {totals.length ? (
                                        <details className="mt-1.5">
                                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                            Per-app lifetime totals at time of event
                                          </summary>
                                          <ul className="list-disc pl-4 mt-1 space-y-0.5 text-muted-foreground">
                                            {totals.map((t) => (
                                              <li key={t.app_id}>
                                                <span className="font-mono text-[11px] break-all">{t.app_id}</span>
                                                <span> — </span>
                                                <span className="tabular-nums">{t.total_units.toLocaleString()}</span>
                                              </li>
                                            ))}
                                          </ul>
                                        </details>
                                      ) : null}
                                    </td>
                                    <td className="py-2 px-2 font-mono text-[11px]">
                                      {txUrl && row.tx_signature ? (
                                        <a
                                          href={txUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-sol-green hover:underline break-all"
                                          title={row.tx_signature}
                                        >
                                          {shortenPubkey(row.tx_signature)}
                                        </a>
                                      ) : (
                                        <span className="text-muted-foreground">—</span>
                                      )}
                                    </td>
                                    <td className="py-2 px-2">
                                      {row.kind === 'withdrawal_to_personal' && recv ? (
                                        <div>
                                          <span className="text-muted-foreground">Recipient: </span>
                                          <a
                                            href={recvUrl!}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="font-mono text-sol-green hover:underline break-all text-[11px]"
                                            title={recv}
                                          >
                                            {shortenPubkey(recv)}
                                          </a>
                                        </div>
                                      ) : (
                                        <span className="text-muted-foreground">—</span>
                                      )}
                                      {row.notes ? (
                                        <div className="mt-1 text-muted-foreground">
                                          Receipt / notes:{' '}
                                          <span className="text-foreground break-words">{row.notes}</span>
                                        </div>
                                      ) : null}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        {ledger.transactions.length < ledger.total ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={ledgerLoadingMore || genBusy}
                            onClick={() => void onLoadMoreLedger()}
                          >
                            {ledgerLoadingMore ? 'Loading…' : 'Load more'}
                          </Button>
                        ) : null}
                      </>
                    )}
                  </div>
                </DetailRow>
                <DetailRow k="Withdraw RRTT to">
                  <div className="space-y-2 max-w-lg">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Optional payout address if you are not using the linked header wallet. On-chain withdraw flow
                      is next.
                    </p>
                    <Input
                      value={withdrawDraft}
                      onChange={(e) => setWithdrawDraft(e.target.value)}
                      placeholder="Solana address (base58)"
                      className="font-mono text-xs"
                      spellCheck={false}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={genBusy || !connected}
                        onClick={() => onUseConnectedForWithdraw()}
                      >
                        Use header wallet
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={genBusy}
                        onClick={() => void onSaveWithdrawDest()}
                      >
                        Save address
                      </Button>
                    </div>
                  </div>
                </DetailRow>
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
              <Button
                type="button"
                variant="outline"
                disabled={busy || linkBusy || genBusy}
                onClick={() => void onDeleteAccount()}
              >
                Delete account
              </Button>
            </CardContent>
          </Card>

          <Button type="button" variant="outline" disabled={busy || linkBusy || genBusy} onClick={() => void onLogout()}>
            Sign out
          </Button>
        </div>
      ) : null}
    </div>
  );
}
