/**
 * Persistent left navigation for the dashboard shell (`app/(app-shell)`).
 * URLs stay the same; only the filesystem route group changes.
 */
export type ShellNavItem = { href: string; label: string };

export type ShellNavGroup = {
  heading: string;
  items: ShellNavItem[];
};

export const DASHBOARD_SHELL_NAV: ShellNavGroup[] = [
  {
    heading: 'Overview',
    items: [{ href: '/dashboard', label: 'Hub' }],
  },
  {
    heading: 'Build',
    items: [
      { href: '/create', label: 'Create token' },
      { href: '/tools', label: 'Tools' },
      { href: '/liquidity', label: 'Liquidity' },
    ],
  },
  {
    heading: 'Distribute',
    items: [
      { href: '/bulk', label: 'Bulk SOL & SPL' },
      { href: '/wallet-generator', label: 'Paper wallet' },
    ],
  },
  {
    heading: 'Discover',
    items: [
      { href: '/recent-tokens', label: 'New tokens' },
      { href: '/token-stats', label: 'Token stats' },
    ],
  },
  {
    heading: 'Program',
    items: [
      { href: '/contracts', label: 'Contracts' },
      { href: '/contracts/vesting', label: 'Vesting' },
      { href: '/referrals', label: 'Referrals' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/docs', label: 'Docs' },
    ],
  },
  {
    heading: 'You',
    items: [
      { href: '/account', label: 'Account' },
      { href: '/account/signup', label: 'Sign up' },
      { href: '/my-actions', label: 'My actions' },
    ],
  },
];

/** In-page sections on `/dashboard` (hash links). */
export const DASHBOARD_HUB_ANCHORS: { hash: string; label: string }[] = [
  { hash: 'dashboard-overview', label: 'Overview' },
  { hash: 'dashboard-start', label: 'Start here' },
  { hash: 'dashboard-launch', label: 'Launch' },
  { hash: 'dashboard-token-manage', label: 'Token manage' },
  { hash: 'dashboard-liquidity', label: 'Liquidity' },
  { hash: 'dashboard-distribute', label: 'Distribute' },
  { hash: 'dashboard-discover', label: 'Discover' },
  { hash: 'dashboard-program', label: 'Program' },
  { hash: 'dashboard-account', label: 'Account' },
];
