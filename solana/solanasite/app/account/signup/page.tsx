import type { Metadata } from 'next';

import { AccountSignupClient } from '@/components/account/AccountSignupClient';

export const metadata: Metadata = {
  title: 'Sign up',
  description: 'Create a RootRecord account — same API as rootrecord.info.',
  robots: { index: false, follow: true },
};

export default function AccountSignupPage() {
  return <AccountSignupClient />;
}
