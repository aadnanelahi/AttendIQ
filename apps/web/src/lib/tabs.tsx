'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { navKeyForPath } from '@/lib/routes';

export interface Tab {
  id: string;
  path: string;
  navKey: string;
}

interface TabsValue {
  tabs: Tab[];
  activePath: string;
  openTab: (path: string) => void;
  closeTab: (id: string) => void;
  isActive: (path: string) => boolean;
}

const STORAGE_KEY = 'attendiq_tabs';
const TabsContext = createContext<TabsValue | null>(null);

function loadTabs(): Tab[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Tab[];
    return parsed.filter((t) => t && typeof t.path === 'string' && typeof t.navKey === 'string');
  } catch {
    return [];
  }
}

export function TabsProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname() ?? '/dashboard';
  const [tabs, setTabs] = useState<Tab[]>(() => loadTabs());

  // Keep the currently open route as an open tab.
  useEffect(() => {
    const navKey = navKeyForPath(pathname);
    if (navKey === pathname) return;
    setTabs((prev) => (prev.some((t) => t.path === pathname) ? prev : [...prev, { id: pathname, path: pathname, navKey }]));
  }, [pathname]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
    } catch {
      // ignore storage errors
    }
  }, [tabs]);

  const openTab = useCallback(
    (path: string) => {
      const navKey = navKeyForPath(path);
      if (navKey === path) return;
      setTabs((prev) => (prev.some((t) => t.path === path) ? prev : [...prev, { id: path, path, navKey }]));
      router.push(path);
    },
    [router],
  );

  const closeTab = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const remaining = prev.filter((t) => t.id !== id);
        const closed = prev.find((t) => t.id === id);
        if (closed && closed.path === pathname) {
          const next = remaining[remaining.length - 1];
          router.push(next ? next.path : '/dashboard');
        }
        return remaining;
      });
    },
    [pathname, router],
  );

  const isActive = useCallback((path: string) => path === pathname, [pathname]);

  return (
    <TabsContext.Provider value={{ tabs, activePath: pathname, openTab, closeTab, isActive }}>
      {children}
    </TabsContext.Provider>
  );
}

export function useTabs(): TabsValue {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('useTabs must be used within TabsProvider');
  return ctx;
}
