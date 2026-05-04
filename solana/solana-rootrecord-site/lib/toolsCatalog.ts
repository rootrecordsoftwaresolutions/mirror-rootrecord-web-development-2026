import type { LucideIcon } from 'lucide-react';
import {
  ShieldOff,
  Lock,
  Snowflake,
  Coins,
  Flame,
  Pencil,
  FileLock2,
  Banknote,
  Wand2,
  Sparkles,
  Layers,
  Rocket,
} from 'lucide-react';

import type { ToolKind } from '@/components/tools/ToolDialog';
import { LAUNCH_FEE_SOL, RAYDIUM_MAINNET_CPMM_POOL_CREATE_FEE_SOL } from '@/lib/solana';

export const LAUNCH_POOL_CARD_DESC = `Create a CPMM pool or add liquidity to an existing one. Mainnet new pool: ~${(RAYDIUM_MAINNET_CPMM_POOL_CREATE_FEE_SOL + LAUNCH_FEE_SOL).toFixed(2)} SOL setup + liquidity (same as Raydium).`;

export type ToolCatalogEntry =
  | {
      kind: ToolKind;
      title: string;
      desc: string;
      icon: LucideIcon;
      tone: 'green' | 'purple';
      t2022?: boolean;
    }
  | {
      href: string;
      title: string;
      desc: string;
      icon: LucideIcon;
      tone: 'green' | 'purple';
      t2022?: boolean;
    };

/** Single source for /tools grid and Dashboard hub (dialog + link cards). */
export const TOOL_CATALOG: ToolCatalogEntry[] = [
  {
    kind: 'revoke-mint',
    title: 'Revoke mint authority',
    desc: 'Lock supply forever. The single most-requested signal of trust for new tokens.',
    icon: ShieldOff,
    tone: 'green',
  },
  {
    kind: 'revoke-freeze',
    title: 'Revoke freeze authority',
    desc: "Tell the market no one can freeze holders' token accounts. A simple, public guarantee.",
    icon: Lock,
    tone: 'green',
  },
  {
    kind: 'freeze-thaw-bulk',
    title: 'Freeze / thaw wallets',
    desc: 'Toggle freeze or thaw for up to 100 lines: holder wallets (ATAs) or raw token accounts for the mint. Freeze authority required. No RootRecord fee for now — network fees only.',
    icon: Snowflake,
    tone: 'green',
  },
  {
    kind: 'mint-more',
    title: 'Mint more tokens',
    desc: 'Top up supply for an airdrop, market making, or LP funding. Mint authority required.',
    icon: Coins,
    tone: 'purple',
  },
  {
    kind: 'burn-tokens',
    title: 'Burn tokens',
    desc: 'Remove tokens from your wallet’s account for that mint and shrink supply. No RootRecord fee — only network fees.',
    icon: Flame,
    tone: 'purple',
  },
  {
    kind: 'update-metadata',
    title: 'Update metadata (legacy)',
    desc: 'Same fields as create—name, symbol, description, website, socials, logo, and listing link. On-chain edits must still be allowed.',
    icon: Pencil,
    tone: 'purple',
  },
  {
    kind: 'lock-metadata',
    title: 'Lock listing metadata (legacy)',
    desc: 'Permanently freeze listing edits on-chain (name, symbol, listing link). Requires the listing update authority wallet — standard SPL + Metaplex only.',
    icon: FileLock2,
    tone: 'green',
  },
  {
    kind: 'withdraw-fees',
    title: 'Withdraw transfer fees',
    desc: 'Pull all withheld transfer fees from your Token-2022 mint into a destination you own.',
    icon: Banknote,
    tone: 'green',
    t2022: true,
  },
  {
    kind: 'harvest-fees',
    title: 'Harvest fees → mint',
    desc: 'Sweep withheld fees from a list of holder accounts back to the mint, ready to withdraw.',
    icon: Wand2,
    tone: 'green',
    t2022: true,
  },
  {
    kind: 'update-fee-config',
    title: 'Update transfer fee config',
    desc: 'Change the basis points or max fee on a Token-2022 mint. Takes effect after 2 epochs.',
    icon: Sparkles,
    tone: 'purple',
    t2022: true,
  },
  {
    href: '/liquidity',
    title: 'Liquidity (Raydium CPMM)',
    desc: LAUNCH_POOL_CARD_DESC,
    icon: Rocket,
    tone: 'green',
  },
  {
    href: '/bulk',
    title: 'Bulk SOL & SPL sends',
    desc: 'Pay many wallets in a few batched transactions — native SOL or SPL tokens. RootRecord fee scales with list size.',
    icon: Layers,
    tone: 'green',
  },
];
