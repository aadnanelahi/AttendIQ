'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/lib/i18n-client';

const NAV_KEYS = [
  ['dashboard', '/dashboard'],
  ['employees', '/employees'],
  ['attendance', '/attendance'],
  ['schedules', '/schedules'],
  ['leave', '/leave'],
  ['overtime', '/overtime'],
  ['payroll', '/payroll'],
  ['devices', '/devices'],
  ['access', '/access'],
  ['visitors', '/visitors'],
  ['reports', '/reports'],
  ['notifications', '/notifications'],
  ['ai', '/ai'],
  ['admin', '/admin'],
] as const;

export function Sidebar(): React.JSX.Element {
  const { t } = useI18n();
  const pathname = usePathname();

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-e border-slate-200 bg-white lg:flex">
      <div className="flex h-14 items-center border-b border-slate-200 px-4">
        <Link href="/dashboard" className="text-lg font-bold text-brand-700">
          {t('common.appName')}
        </Link>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV_KEYS.map(([key, href]) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {t(`nav.${key}`)}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}