import { DashboardShell } from '@/components/dashboard/DashboardShell';

export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
