'use client';

import type { ReactNode } from 'react';
import { TabsProvider } from '@/lib/tabs';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { TabsBar } from '@/components/TabsBar';

export function AppShell({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <TabsProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <TabsBar />
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </TabsProvider>
  );
}
