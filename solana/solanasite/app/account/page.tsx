import type { Metadata } from 'next';

import { AccountPageClient } from '@/components/account/AccountPageClient';

export const metadata: Metadata = {
  title: 'Account',
  description:
    'Sign in to your RootRecord account for subscription status and billing — same credentials as rootrecord.info.',
  robots: { index: false, follow: true },
};

export default function AccountPage() {
  return <AccountPageClient />;
}
