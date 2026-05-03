'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { toast } from 'sonner';

import { ExternalLink } from 'lucide-react';
import QRCode from 'react-qr-code';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
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
  portalWithdrawRrtt,
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
import { fetchCustodialMainnetBalances, type CustodialChainBalances } from '@/lib/custodialMainnetBalances';

type Phase = 'loading' | 'forms' | 'account';

const ACCOUNT_LOADING_LINES = [
  'Loading your account…',
  'Checking your plan…',
  'Loading rewards…',
  'Almost done…',
];

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

/** Non-negative lamports from /v1/me (number, decimal string, or bigint-safe string). */
function solCachedLamportsBigint(me: PortalMeData | null): bigint | null {
  const v = me?.custodial_sol_lamports_cached;
  if (v == null) return null;
  if (typeof v === 'bigint') return v < 0n ? 0n : v;
  if (typeof v === 'string') {
    const t = v.trim();
    if (!t) return null;
    if (/^\d+$/.test(t)) {
      try {
        return BigInt(t);
      } catch {
        return null;
      }
    }
    const n = Number(t);
    return Number.isFinite(n) ? BigInt(Math.max(0, Math.floor(n))) : null;
  }
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return BigInt(Math.max(0, Math.floor(n)));
}

function rewardsLedgerKindLabel(row: RewardsLedgerTransaction): string {
  if (row.kind === 'treasury_to_custodial') return 'Rewards moved into your hosted wallet';
  if (row.kind === 'withdrawal_to_personal') return 'Sent to your own wallet';
  return row.kind || 'Entry';
}

function shortenPubkey(s: string): string {
  const t = s.trim();
  if (t.length <= 16) return t;
  return `${t.slice(0, 8)}…${t.slice(-6)}`;
}

/** Exact token string from non-negative raw amount and decimals (no float math). */
function formatRawBaseUnitsExact(raw: bigint, decimals: number, suffix: string): string {
  const d = Math.min(18, Math.max(0, Math.floor(decimals)));
  const div = BigInt(10) ** BigInt(d);
  const r = raw < 0n ? 0n : raw;
  const whole = r / div;
  let frac = (r % div).toString().padStart(d, '0');
  frac = frac.replace(/0+$/, '');
  if (!frac) return `${whole.toString()} ${suffix}`;
  return `${whole.toString()}.${frac} ${suffix}`;
}

/** Exact SOL string from integer lamports (no float math; trims trailing fractional zeros only). */
function formatLamportsAsSolExact(lamports: bigint | number): string {
  const lam =
    typeof lamports === 'bigint' ? (lamports < 0n ? 0n : lamports) : BigInt(Math.max(0, Math.floor(Number(lamports) || 0)));
  return formatRawBaseUnitsExact(lam, 9, 'SOL');
}

const SOLSCAN_ACCOUNT_BASE = 'https://solscan.io/account/';

function solscanAccountHref(pubkey: string): string {
  return `${SOLSCAN_ACCOUNT_BASE}${encodeURIComponent(pubkey.trim())}`;
}

function SolscanAddressLink({ address, className }: { address: string; className?: string }) {
  const t = address.trim();
  if (!t) return null;
  return (
    <a
      href={solscanAccountHref(t)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-start gap-1.5 font-mono text-xs text-sol-green hover:underline break-all',
        className,
      )}
    >
      <span>{t}</span>
      <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
    </a>
  );
}

const SOLSCAN_TX_BASE = 'https://solscan.io/tx/';

function solscanTxHref(signature: string): string {
  return `${SOLSCAN_TX_BASE}${encodeURIComponent(signature.trim())}`;
}

function SolscanTxLink({ signature, className }: { signature: string; className?: string }) {
  const s = signature.trim();
  if (!s) return null;
  return (
    <a
      href={solscanTxHref(s)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center gap-1.5 font-mono text-xs text-sol-green hover:underline break-all',
        className,
      )}
    >
      <span>{shortenPubkey(s)}</span>
      <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
    </a>
  );
}

function ledgerTxUrl(row: RewardsLedgerTransaction, explorerTxBase: string | undefined): string | null {
  const sig = row.tx_signature?.trim();
  if (!sig) return null;
  const base = (explorerTxBase || SOLSCAN_TX_BASE).trim();
  return base.endsWith('/') ? `${base}${encodeURIComponent(sig)}` : `${base}/${encodeURIComponent(sig)}`;
}

function BalanceStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/35 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 text-base font-semibold tabular-nums tracking-tight text-foreground">{value}</div>
      {hint ? <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function earnOptionalInt(earn: EarnSummary | null, key: string): number | null {
  if (!earn || !(key in earn)) return null;
  const n = Number((earn as Record<string, unknown>)[key]);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

function RewardsProgramNote({ earn }: { earn: EarnSummary | null }) {
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
        Rewards summary didn’t load. Use a RootRecord app while signed in, then refresh this page. {learn}
      </p>
    );
  }
  return null;
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
  const [loadingLineIdx, setLoadingLineIdx] = useState(0);
  const [status, setStatus] = useState<{ msg: string; kind: 'ok' | 'warn' | 'err' | '' }>({ msg: '', kind: '' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [withdrawDraft, setWithdrawDraft] = useState('');
  const [withdrawAmtWhole, setWithdrawAmtWhole] = useState('');
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  /** After withdraw: success summary, or on-chain sig when the server reported ledger/update issues. */
  const [withdrawNotice, setWithdrawNotice] = useState<{
    tx_signature: string;
    amount_whole: number;
    destination: string;
    error?: string;
  } | null>(null);
  const [me, setMe] = useState<PortalMeData | null>(null);
  const [earn, setEarn] = useState<EarnSummary | null>(null);
  const [ledger, setLedger] = useState<RewardsLedgerPage | null>(null);
  const [ledgerErr, setLedgerErr] = useState('');
  const [ledgerLoadingMore, setLedgerLoadingMore] = useState(false);
  /** Mainnet balances read in the browser (uses NEXT_PUBLIC_RPC_URL + public fallbacks) when `/v1/me` exposes mint. */
  const [chainBal, setChainBal] = useState<CustodialChainBalances | null>(null);
  const hasApi = Boolean(getRootRecordApiBase());

  const applyStatus = (msg: string, kind: 'ok' | 'warn' | 'err' | '') => {
    setStatus({ msg, kind });
  };

  const loadAccount = useCallback(async (softRefresh?: boolean) => {
    const soft = Boolean(softRefresh);
    const token = getPortalToken();
    if (!token || !hasApi) {
      syncPortalLifetimeFromMe(null);
      setPhase('forms');
      return;
    }
    if (!soft) {
      setPhase('loading');
      setLoadingLineIdx(0);
      applyStatus('', '');
    }
    const [r, e, lg] = await Promise.all([
      fetchPortalMe(token),
      fetchEarnSummary(token),
      fetchRewardsLedger(token, { limit: 25, offset: 0 }),
    ]);
    if (r.ok === false && r.status === 401) {
      clearPortalSession();
      syncPortalLifetimeFromMe(null);
      setLedger(null);
      setLedgerErr('');
      setEarn(null);
      applyStatus('Your session ended. Please sign in again.', 'warn');
      setPhase('forms');
      return;
    }
    if (r.ok === false) {
      if (!soft) {
        setMe(null);
        setEarn(null);
        setLedger(null);
        setLedgerErr('');
        applyStatus('We could not load your account. Please try again in a moment.', 'err');
      } else {
        applyStatus('Could not refresh your account. Will retry automatically.', 'warn');
      }
      setPhase('account');
      return;
    }
    setLedgerErr('');
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

  useEffect(() => {
    if (phase !== 'loading') return;
    const id = window.setInterval(() => {
      setLoadingLineIdx((i) => (i + 1) % ACCOUNT_LOADING_LINES.length);
    }, 2200);
    return () => window.clearInterval(id);
  }, [phase]);

  /** Refresh portal + earn + ledger while signed in (API pulls mainnet and updates D1 cache server-side). */
  useEffect(() => {
    if (phase !== 'account' || !hasApi) return;
    const id = setInterval(() => {
      void loadAccount(true);
    }, 45_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') void loadAccount(true);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [phase, hasApi, loadAccount]);

  useEffect(() => {
    if (phase !== 'account' || !me) {
      setChainBal(null);
      return;
    }
    const pk = custodialPubFromMe(me);
    const mintRaw = me.rrtt_mint_base58;
    const mint = typeof mintRaw === 'string' ? mintRaw.trim() : '';
    const dRaw = me.rrtt_mint_decimals;
    const dec = typeof dRaw === 'number' ? dRaw : Number(dRaw);
    if (!pk || !mint || !Number.isFinite(dec)) {
      setChainBal(null);
      return;
    }
    let cancelled = false;
    void fetchCustodialMainnetBalances(pk, mint, Math.min(9, Math.max(0, Math.floor(dec)))).then((b) => {
      if (!cancelled) setChainBal(b);
    });
    return () => {
      cancelled = true;
    };
  }, [phase, me]);

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
      'Delete your RootRecord account?\n\n' +
        'This removes your profile and data we store for you (saved spots, alerts, and similar). ' +
        'Your hosted reward wallet is closed: we move SOL, RRTT, and other tokens back to RootRecord when the network allows. ' +
        'Withdraw anything you want to keep first. If that return step fails, we cancel deletion. ' +
        'Some encrypted backup data may stay with us for safety — don’t rely on deletion to erase keys. ' +
        'This cannot be undone once it succeeds.',
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
      toast.error('Connect your wallet at the top of the page, then try again.');
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
      await loadAccount(true);
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
    await loadAccount(true);
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
    toast.success('Hosted wallet ready');
    await loadAccount(true);
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
    await loadAccount(true);
  }

  async function onWithdrawRrtt() {
    const token = getPortalToken();
    if (!token || !me) {
      applyStatus('You are not signed in.', 'warn');
      return;
    }
    const raw = withdrawAmtWhole.replace(/,/g, '').trim();
    let amount: number | undefined;
    if (raw !== '') {
      const n = Math.floor(Number(raw));
      if (!Number.isFinite(n) || n < 1) {
        toast.error('Enter a whole number ≥ 1, or leave blank for full balance.');
        return;
      }
      amount = n;
    }
    setWithdrawBusy(true);
    applyStatus('', '');
    setWithdrawNotice(null);
    try {
      const r = await portalWithdrawRrtt(token, amount != null ? { amount_whole: amount } : {});
      if (!r.ok) {
        toast.error(r.detail);
        if (r.tx_signature) {
          setWithdrawNotice({
            tx_signature: r.tx_signature,
            amount_whole: 0,
            destination: '',
            error: r.detail,
          });
        }
        return;
      }
      setWithdrawNotice({
        tx_signature: r.tx_signature,
        amount_whole: r.amount_whole,
        destination: r.destination,
      });
      toast.success(`Sent ${r.amount_whole.toLocaleString()} RRTT to your payout address.`, {
        description: 'Confirmation and Solscan link stay on this page below.',
        duration: 10_000,
      });
      setWithdrawAmtWhole('');
      await loadAccount(true);
    } finally {
      setWithdrawBusy(false);
    }
  }

  function onUseConnectedForWithdraw() {
    if (!publicKey) {
      toast.error('Connect a wallet at the top of the page first');
      return;
    }
    setWithdrawDraft(publicKey.toBase58());
  }

  const sub = me ? subscriptionLine(me) : { text: '', showBillingLink: false };
  const linkedPk = me ? linkedWalletFromMe(me) : '';
  const linkedVerified = me ? linkedVerifiedFromMe(me) : '';
  const connectedPk = publicKey?.toBase58() ?? '';
  const linkedMatchesConnected = Boolean(linkedPk && connectedPk && linkedPk === connectedPk);
  const savedWithdrawDest =
    me && typeof me.withdraw_dest_pubkey === 'string' ? me.withdraw_dest_pubkey.trim() : '';
  const canWithdrawDest = Boolean(linkedVerified || savedWithdrawDest);
  const custodialPk = custodialPubFromMe(me);
  const solLamportsApi = solCachedLamportsBigint(me);
  const solLamportsChain =
    chainBal?.solOk === true && chainBal.lamports != null
      ? BigInt(Math.max(0, Math.floor(chainBal.lamports)))
      : null;
  /** Browser mainnet read wins; otherwise exact lamports from API cache. */
  const solLamportsDisplay = solLamportsChain ?? solLamportsApi;
  const onchainRrttApi = earnOptionalInt(earn, 'custodial_onchain_rrtt');
  /** Whole RRTT units Solana shows in custodial wallet (browser read wins over API when present). */
  const rrttInWallet =
    chainBal?.tokenOk === true ? (chainBal.rrttWhole ?? 0) : (onchainRrttApi ?? 0);
  const totalEarnUnits =
    earn != null && Number.isFinite(Number(earn.balance)) ? Math.max(0, Math.floor(Number(earn.balance))) : null;
  /** Units the earn program has recorded as moved to custodial (not SPL read — avoids double-count vs `balance`). */
  const unitsSentRaw = earnOptionalInt(earn, 'custodial_units_sent');
  const unitsSentToCustodial = unitsSentRaw != null ? Math.max(0, unitsSentRaw) : 0;
  /** Not yet mirrored to custodial in our ledger = earn credits minus recorded sends (matches Worker cron `pending`). */
  const pendingUnits =
    totalEarnUnits != null ? Math.max(0, totalEarnUnits - unitsSentToCustodial) : null;
  /** Headline total = pending slice + SPL in custodial wallet (e.g. 135,800 + 1 = 135,801 — not balance + wallet). */
  const sumLedgerWallet =
    pendingUnits != null ? pendingUnits + rrttInWallet : null;
  /** RRTT in the custodial SPL account is what the user can withdraw from that account. */
  const availWithdraw = rrttInWallet;

  const usdcDisplay =
    chainBal?.usdcOk === true && chainBal.usdcRaw != null
      ? formatRawBaseUnitsExact(chainBal.usdcRaw, 6, 'USDC')
      : null;

  const balancesLearnLink = (
    <a
      href={portalAbsoluteUrl('/beta-tester-rewards.html')}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sol-green hover:underline font-medium"
    >
      Learn more
    </a>
  );

  return (
    <div className="container py-8 md:py-12 max-w-4xl">
      <div className="mb-8 space-y-2">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Account</p>
        <h1 className="font-display text-3xl md:text-4xl tracking-tight text-foreground">
          Your <em className="not-italic text-sol-green">account</em>.
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
          Same email and password as{' '}
          <a href="https://rootrecord.info" className="text-sol-green hover:underline">
            rootrecord.info
          </a>
          . Your membership, test rewards, hosted reward wallet, and linked personal wallet are together here.
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
            Sign-in isn’t available on this build (missing site configuration). If you’re the host, set the public API
            URL env var so this page can reach RootRecord — see project docs.
          </CardContent>
        </Card>
      ) : null}

      {phase === 'loading' && hasApi ? (
        <Card className="border-border bg-ink-800/40">
          <CardContent className="py-10 sm:py-12">
            <div className="flex flex-col items-center justify-center gap-5 text-center" aria-busy="true" aria-live="polite">
              <div
                className="h-9 w-9 rounded-full border-2 border-sol-green/25 border-t-sol-green animate-spin"
                aria-hidden
              />
              <p
                key={loadingLineIdx}
                className="text-sm text-muted-foreground max-w-md animate-in fade-in duration-300"
              >
                {ACCOUNT_LOADING_LINES[loadingLineIdx]}
              </p>
              <p className="text-xs text-muted-foreground/80">This usually takes only a moment.</p>
            </div>
          </CardContent>
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
            <CardHeader className="pb-0">
              <CardTitle className="text-lg">Profile</CardTitle>
              <CardDescription className="text-muted-foreground">Your email, account id, and plan.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border border-border/60 bg-background/30 px-3 sm:px-4">
                <DetailRow k="Email">{String(me.email || '—')}</DetailRow>
                <DetailRow k="Account ID">
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
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-ink-800/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Balances</CardTitle>
              <CardDescription className="text-muted-foreground">
                Numbers come from RootRecord and, when possible, a live check on Solana. We pay the network fee when
                you cash out <span className="text-foreground font-medium">RRTT</span> rewards to your saved or linked
                address. If you move <span className="text-foreground font-medium">SOL</span>,{' '}
                <span className="text-foreground font-medium">USDC</span>, or other tokens out of your hosted wallet, you
                pay those fees yourself (keep a little SOL in that wallet for fees).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <BalanceStat
                  label="Total RRTT (credits + in wallet)"
                  value={
                    sumLedgerWallet != null ? (
                      <>
                        {sumLedgerWallet.toLocaleString()}{' '}
                        <span className="text-muted-foreground font-medium text-sm">RRTT</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )
                  }
                  hint={
                    totalEarnUnits != null
                      ? `Still settling: ${pendingUnits?.toLocaleString() ?? '—'} + already in your hosted wallet: ${rrttInWallet.toLocaleString()} = ${sumLedgerWallet?.toLocaleString() ?? '—'} (lifetime credits from apps: ${totalEarnUnits.toLocaleString()}).`
                      : 'Credits we owe you plus RRTT already sitting in your hosted wallet.'
                  }
                />
                <BalanceStat
                  label="Still settling into your wallet"
                  value={
                    pendingUnits != null ? (
                      <span className={pendingUnits > 0 ? 'text-amber-200/95' : undefined}>
                        {pendingUnits.toLocaleString()}{' '}
                        <span className="text-muted-foreground font-medium text-sm">RRTT</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )
                  }
                  hint="Rewards we’ve counted for you that haven’t been moved into your hosted wallet yet."
                />
                <BalanceStat
                  label="Ready to withdraw"
                  value={
                    availWithdraw != null ? (
                      <span className={availWithdraw > 0 ? 'text-sol-green' : undefined}>
                        {availWithdraw.toLocaleString()}{' '}
                        <span className="text-muted-foreground font-medium text-sm">RRTT</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )
                  }
                  hint="RRTT that’s already in your hosted wallet — this is what you can send to your payout address. We cover the fee for that RRTT cash-out."
                />
                <BalanceStat
                  label="SOL in hosted wallet"
                  value={
                    solLamportsDisplay != null ? (
                      <span className="font-mono text-sm tabular-nums">
                        {formatLamportsAsSolExact(solLamportsDisplay)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )
                  }
                  hint="SOL you can use for fees when you move tokens yourself. A small amount usually stays put so the account stays open."
                />
                <BalanceStat
                  label="USDC in hosted wallet"
                  value={
                    usdcDisplay != null ? (
                      <span className="font-mono text-sm tabular-nums">{usdcDisplay}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )
                  }
                  hint="USDC balance in your hosted wallet. Moving USDC uses SOL from that same wallet for fees — we don’t cover those."
                />
                <BalanceStat
                  label="Quick guide"
                  value={
                    <span className="block text-xs font-normal font-sans leading-relaxed text-muted-foreground tracking-normal">
                      <strong className="text-foreground font-medium">Total</strong> = rewards still settling + RRTT
                      already in your hosted wallet (we don’t double-count). <strong className="text-foreground font-medium">Ready to withdraw</strong>{' '}
                      is the RRTT you can cash out now. <strong className="text-foreground font-medium">Fees:</strong>{' '}
                      RootRecord pays the network fee for RRTT cash-outs to your linked or saved address; you pay fees
                      for other moves. {balancesLearnLink}
                    </span>
                  }
                />
              </div>
              <RewardsProgramNote earn={earn} />
              <p className="text-xs text-muted-foreground border-t border-border/60 pt-3 leading-relaxed">
                <strong className="text-foreground">Automated settlement (UTC):</strong> Once per day at{' '}
                <strong className="text-foreground">07:00 UTC</strong>, RootRecord&apos;s backend tries to move
                owed RRTT from your rewards ledger into this hosted wallet and to top up a small SOL reserve when
                it is below threshold (for fees). Until that job succeeds on-chain, RRTT can show as still settling.
                Treasury balance, RPC health, or account state can delay a payout; the schedule is daily, not
                per-event.
              </p>
            </CardContent>
          </Card>

          <Card className="border-border bg-ink-800/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Hosted reward wallet</CardTitle>
              <CardDescription className="text-muted-foreground">
                A wallet RootRecord holds for you so test rewards (RRTT) can land in one place. You still control
                cash-outs to your own address. Incoming RRTT and SOL reserve top-ups follow the daily 07:00 UTC job
                described under Balances.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {custodialPk ? (
                <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <SolscanAddressLink address={custodialPk} />
                    <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
                      Add SOL here if you plan to move USDC or other tokens yourself — those moves use SOL for network
                      fees. RRTT cash-outs to your payout address use a fee we pay. Scan the QR from your phone to
                      deposit.
                    </p>
                  </div>
                  <div className="flex flex-col items-center gap-2 shrink-0 mx-auto lg:mx-0">
                    <div className="rounded-xl bg-white p-2.5 shadow-md ring-1 ring-black/5">
                      <QRCode value={custodialPk} size={168} style={{ height: 'auto', maxWidth: '100%' }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground text-center max-w-[11rem] leading-snug">
                      QR is only your public address — never a secret key.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <EmptyLine>No hosted wallet yet — create one to receive RRTT rewards here.</EmptyLine>
                  <Button
                    type="button"
                    size="sm"
                    className="shrink-0"
                    disabled={busy || linkBusy || genBusy}
                    onClick={() => void onGenerateCustodialWallet()}
                  >
                    {genBusy ? 'Creating…' : 'Create wallet'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border bg-ink-800/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Hosted wallet activity</CardTitle>
              <CardDescription className="text-muted-foreground">
                On-chain moves for your hosted reward wallet: rewards paid in, and RRTT you cashed out. Each entry links
                to Solscan (mainnet).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <details className="group text-muted-foreground">
                <summary className="cursor-pointer text-xs hover:text-foreground [&::-webkit-details-marker]:hidden">
                  <span className="underline-offset-2 group-open:underline">What this list is</span>
                </summary>
                <p className="mt-2 leading-relaxed pl-0.5 border-l-2 border-border/80 pl-3">
                  Each row is a finished move on Solana — into your hosted wallet or out to you. We show which apps the
                  rewards came from when we have that detail.
                </p>
              </details>
              {ledgerErr ? (
                <p className="text-destructive text-xs">{ledgerErr}</p>
              ) : !ledger || ledger.total === 0 ? (
                <p className="text-muted-foreground">
                  No moves yet — they’ll show up here after the first treasury or cash-out transfer.
                </p>
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
                  <div className="space-y-3 md:hidden">
                    {ledger.transactions.map((row) => {
                      const txUrl = ledgerTxUrl(row, ledger.explorer_tx_base);
                      const recv = row.recipient_pubkey?.trim();
                      const recvUrl = recv ? solscanAccountHref(recv) : null;
                      const att = row.app_snapshot.attributed_to_this_transfer;
                      const totals = row.app_snapshot.per_app_totals_at_transfer;
                      return (
                        <div
                          key={row.id}
                          className="rounded-lg border border-border/80 bg-background/40 p-3 space-y-2 text-xs"
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-2 gap-y-1">
                            <span className="text-muted-foreground">{formatLedgerWhen(row.created_at)}</span>
                            <span className="tabular-nums font-semibold text-foreground">
                              {row.direction === 'out' ? '−' : '+'}
                              {row.units.toLocaleString()} RRTT
                            </span>
                          </div>
                          <p className="font-medium text-foreground leading-snug">{rewardsLedgerKindLabel(row)}</p>
                          {row.kind === 'treasury_to_custodial' && row.earn_balance_snapshot != null ? (
                            <p className="text-muted-foreground">
                              Rewards total at that time:{' '}
                              <span className="tabular-nums text-foreground">{row.earn_balance_snapshot}</span>
                            </p>
                          ) : null}
                          <div className="flex flex-col gap-1.5 min-w-0">
                            <span className="text-muted-foreground">Transaction</span>
                            {txUrl && row.tx_signature ? (
                              <a
                                href={txUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 font-mono text-sol-green hover:underline break-all text-[11px]"
                              >
                                View on Solscan
                                <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                              </a>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </div>
                          {row.kind === 'withdrawal_to_personal' && recv ? (
                            <div className="min-w-0">
                              <span className="text-muted-foreground">Sent to </span>
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
                          ) : null}
                          {row.notes ? (
                            <p className="text-muted-foreground">
                              Note: <span className="text-foreground break-words">{row.notes}</span>
                            </p>
                          ) : null}
                          {att.length ? (
                            <details className="text-muted-foreground">
                              <summary className="cursor-pointer hover:text-foreground">From apps ({att.length})</summary>
                              <ul className="list-disc pl-4 mt-1 space-y-0.5">
                                {att.map((a) => (
                                  <li key={a.app_id}>
                                    <span className="font-mono text-[11px] break-all">{a.app_id}</span>
                                    <span className="text-muted-foreground"> — </span>
                                    <span className="tabular-nums">{a.units.toLocaleString()}</span> units
                                  </li>
                                ))}
                              </ul>
                            </details>
                          ) : (
                            <p className="text-muted-foreground">No app breakdown for this row</p>
                          )}
                          {totals.length ? (
                            <details className="text-muted-foreground">
                              <summary className="cursor-pointer hover:text-foreground">Totals per app (at that time)</summary>
                              <ul className="list-disc pl-4 mt-1 space-y-0.5">
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
                        </div>
                      );
                    })}
                  </div>
                  <div className="hidden md:block overflow-x-auto rounded-md border border-border/80 -mx-1">
                    <table className="w-full min-w-[640px] text-left border-collapse">
                      <thead>
                        <tr className="border-b border-border/80 bg-background/50 text-muted-foreground">
                          <th className="py-2 px-2 font-medium whitespace-nowrap">When</th>
                          <th className="py-2 px-2 font-medium">What</th>
                          <th className="py-2 px-2 font-medium text-right whitespace-nowrap">RRTT</th>
                          <th className="py-2 px-2 font-medium min-w-[11rem]">From apps</th>
                          <th className="py-2 px-2 font-medium min-w-[9rem]">Transaction</th>
                          <th className="py-2 px-2 font-medium min-w-[9rem]">To / note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledger.transactions.map((row) => {
                          const txUrl = ledgerTxUrl(row, ledger.explorer_tx_base);
                          const recv = row.recipient_pubkey?.trim();
                          const recvUrl = recv ? solscanAccountHref(recv) : null;
                          const att = row.app_snapshot.attributed_to_this_transfer;
                          const totals = row.app_snapshot.per_app_totals_at_transfer;
                          return (
                            <tr key={row.id} className="border-b border-border/50 align-top last:border-0">
                              <td className="py-2 px-2 text-muted-foreground whitespace-nowrap">
                                {formatLedgerWhen(row.created_at)}
                              </td>
                              <td className="py-2 px-2">
                                <div>{rewardsLedgerKindLabel(row)}</div>
                                {row.kind === 'treasury_to_custodial' && row.earn_balance_snapshot != null ? (
                                  <div className="text-muted-foreground mt-0.5">
                                    Rewards total at that time:{' '}
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
                                  <span className="text-muted-foreground">No app breakdown for this row</span>
                                )}
                                {totals.length ? (
                                  <details className="mt-1.5">
                                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                      Totals per app (at that time)
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
                                    <span className="text-muted-foreground">Sent to: </span>
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
                                    Note: <span className="text-foreground break-words">{row.notes}</span>
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
            </CardContent>
          </Card>

          <Card className="border-border bg-ink-800/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Your own wallet</CardTitle>
              <CardDescription className="text-muted-foreground">
                The Solana wallet you connect at the top of the site. Link it once so we know payouts go to you.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  {linkedPk ? (
                    <>
                      <SolscanAddressLink address={linkedPk} />
                      {linkedVerified ? (
                        <p className="text-xs text-muted-foreground">
                          Verified {formatLinkedVerifiedAt(linkedVerified)}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <EmptyLine>Not linked yet — connect your wallet at the top, then sign once here.</EmptyLine>
                  )}
                  {linkedPk && connectedPk && !linkedMatchesConnected ? (
                    <p className="text-xs text-amber-200/90 leading-relaxed">
                      The wallet connected up top ({connectedPk.slice(0, 4)}…{connectedPk.slice(-4)}) isn’t your linked
                      wallet. Payouts use the linked address below.
                    </p>
                  ) : null}
                  {!connected && !linkedPk ? (
                    <p className="text-xs text-muted-foreground">Connect a wallet from the button at the top of the page first.</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2 self-start lg:justify-end">
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
                          ? 'Use connected wallet instead'
                          : 'Link connected wallet'}
                    </Button>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-ink-800/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Cash out RRTT</CardTitle>
              <CardDescription className="text-muted-foreground">
                Send RRTT to your linked wallet, or to another Solana address you save below. We pay the network fee for
                that RRTT send. Other tokens you move from your hosted wallet still use your SOL for fees.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {withdrawNotice ? (
                <div
                  role="status"
                  className={cn(
                    'rounded-lg border p-3 space-y-2 text-sm',
                    withdrawNotice.error
                      ? 'border-amber-500/45 bg-amber-500/10 text-amber-50'
                      : 'border-sol-green/35 bg-sol-green/10 text-foreground',
                  )}
                >
                  {withdrawNotice.error ? (
                    <>
                      <p className="font-medium text-amber-100">Something went wrong after signing</p>
                      <p className="text-xs leading-relaxed opacity-95">{withdrawNotice.error}</p>
                      <p className="text-xs leading-relaxed text-amber-100/90">
                        If the transfer actually landed on-chain, use this signature when you contact support. It may
                        still appear under <strong className="font-medium">Hosted wallet activity</strong> after a
                        refresh.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium text-foreground">Withdrawal confirmed on Solana</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Sent{' '}
                        <strong className="tabular-nums text-foreground">
                          {withdrawNotice.amount_whole.toLocaleString()} RRTT
                        </strong>
                        {withdrawNotice.destination ? (
                          <>
                            {' '}
                            to{' '}
                            <span className="font-mono text-foreground break-all">{withdrawNotice.destination}</span>
                          </>
                        ) : null}
                        . It will show in <strong className="text-foreground font-medium">Hosted wallet activity</strong>{' '}
                        on this page after the list refreshes.
                      </p>
                    </>
                  )}
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pt-1">
                    <SolscanTxLink signature={withdrawNotice.tx_signature} className="text-sm font-medium" />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 shrink-0 text-muted-foreground hover:text-foreground self-start sm:self-center"
                      onClick={() => setWithdrawNotice(null)}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              ) : null}
              <div className="space-y-2 max-w-lg">
                <Input
                  value={withdrawDraft}
                  onChange={(e) => setWithdrawDraft(e.target.value)}
                  placeholder="Solana wallet address"
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
                    Use connected wallet
                  </Button>
                  <Button type="button" size="sm" disabled={genBusy} onClick={() => void onSaveWithdrawDest()}>
                    Save address
                  </Button>
                </div>
              </div>
              {savedWithdrawDest ? (
                <p className="text-xs text-muted-foreground">
                  <span className="text-muted-foreground">Saved address: </span>
                  <SolscanAddressLink address={savedWithdrawDest} />
                </p>
              ) : null}
              <div className="space-y-2 max-w-lg pt-4 border-t border-border/60 mt-4">
                <Label className="text-xs">Withdraw RRTT (whole numbers)</Label>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Sends from your hosted wallet to your verified linked wallet, or to the saved address if you
                  don’t use a linked wallet. Leave the amount blank to send everything that’s ready. We pay the fee for
                  this RRTT send.
                </p>
                <Input
                  value={withdrawAmtWhole}
                  onChange={(e) => setWithdrawAmtWhole(e.target.value)}
                  placeholder={availWithdraw != null ? `Max ${availWithdraw.toLocaleString()} (blank = all)` : 'Amount'}
                  className="font-mono text-xs"
                  inputMode="numeric"
                  spellCheck={false}
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    withdrawBusy ||
                    genBusy ||
                    !custodialPk ||
                    availWithdraw == null ||
                    availWithdraw < 1 ||
                    !canWithdrawDest
                  }
                  onClick={() => void onWithdrawRrtt()}
                >
                  {withdrawBusy ? 'Sending…' : 'Withdraw RRTT'}
                </Button>
                {!canWithdrawDest ? (
                  <p className="text-xs text-amber-200/90">
                    Link and verify your own wallet, or save a payout address here, before you can withdraw.
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="pt-6 space-y-3">
              <h3 className="text-base font-semibold text-foreground">Delete account</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                This removes your RootRecord profile and data we keep for you (like saved spots or alerts). Your hosted
                reward wallet is closed: we move SOL, RRTT, and other tokens back to RootRecord when the network allows
                it. <strong className="text-foreground font-medium">Withdraw anything you want to keep first.</strong>{' '}
                If the return step can’t finish, we’ll block deletion until it does. Some encrypted backup data may stay
                in our systems for safety and recovery — don’t rely on deletion to erase keys.
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
