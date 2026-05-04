import type { ReactNode } from 'react';

import { OperationsWikiLayout } from '@/components/operations/OperationsWikiLayout';

export default function OperationsLayout({ children }: { children: ReactNode }) {
  return <OperationsWikiLayout>{children}</OperationsWikiLayout>;
}
