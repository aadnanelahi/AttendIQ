import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';

export default function AppLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return <AppShell>{children}</AppShell>;
}
