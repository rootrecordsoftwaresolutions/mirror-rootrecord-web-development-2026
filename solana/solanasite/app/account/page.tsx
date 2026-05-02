import type { Metadata } from 'next';

import { AccountPageClient } from '@/components/account/AccountPageClient';

export const metadata: Metadata = {
  title: 'Account',
  description:
    'Sign in with the same email and password as rootrecord.info — plan, rewards, and wallets in one place.',
  robots: { index: false, follow: true },
};

export default function AccountPage() {
  return <AccountPageClient />;
}
