import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { ConfirmProvider } from '@/components/ConfirmProvider';

export default function AppLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <ConfirmProvider>
      <AppShell>{children}</AppShell>
    </ConfirmProvider>
  );
}
