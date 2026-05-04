'use client';

import { useCallback, useEffect, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fetchCustodialInfo, getPortalToken } from '@/lib/rootrecordSession';
import { getConnection } from '@/lib/solana';
import { listSplMintsForOwner, type ListedSplMint } from '@/lib/walletSplMints';
import { cn } from '@/lib/utils';

const selectClass = cn(
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
  'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
);

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** Forwarded to the manual mint input (e2e). */
  inputTestId?: string;
  disabled?: boolean;
};

export function MintFromWalletField({
  id,
  label,
  value,
  onChange,
  placeholder = 'Mint address (base58)',
  inputTestId,
  disabled,
}: Props) {
  const wallet = useWallet();
  const [rows, setRows] = useState<ListedSplMint[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const conn = getConnection();
      const merged = new Map<string, ListedSplMint>();
      const merge = (list: ListedSplMint[]) => {
        for (const r of list) merged.set(r.mint, r);
      };
      if (wallet.publicKey) {
        merge(await listSplMintsForOwner(conn, wallet.publicKey, ''));
      }
      const token = getPortalToken();
      if (token) {
        const info = await fetchCustodialInfo(token);
        const pk = info?.public_key?.trim();
        if (pk) {
          try {
            merge(await listSplMintsForOwner(conn, new PublicKey(pk), 'Hosted · '));
          } catch {
            /* ignore */
          }
        }
      }
      setRows([...merged.values()].sort((a, b) => a.label.localeCompare(b.label)));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [wallet.publicKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onAuth = () => void refresh();
    if (typeof window === 'undefined') return;
    window.addEventListener('rootrecord-portal-auth-change', onAuth);
    return () => window.removeEventListener('rootrecord-portal-auth-change', onAuth);
  }, [refresh]);

  const showPicker = wallet.connected || rows.length > 0 || loading;

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {showPicker ? (
        <select
          className={selectClass}
          aria-label="Pick a mint from your wallets"
          disabled={disabled || loading}
          value=""
          onChange={(e) => {
            const v = e.target.value.trim();
            if (v) onChange(v);
            e.currentTarget.selectedIndex = 0;
          }}
        >
          <option value="">
            {loading
              ? 'Loading tokens from wallet…'
              : rows.length
                ? 'Pick from connected / hosted wallet…'
                : 'No SPL balances in wallet — paste mint below'}
          </option>
          {rows.map((r) => (
            <option key={r.mint} value={r.mint}>
              {r.label}
            </option>
          ))}
        </select>
      ) : null}
      <Input
        id={id}
        data-testid={inputTestId}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="font-mono text-sm"
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  );
}
