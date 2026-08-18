'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clearTokens } from '@/lib/api';
import { locales, type Locale } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n-client';

const MOBILE_NAV_KEYS = [
  ['dashboard', '/dashboard'],
  ['employees', '/employees'],
  ['attendance', '/attendance'],
  ['devices', '/devices'],
  ['payroll', '/payroll'],
] as const;

export function Topbar(): React.JSX.Element {
  const { t, locale, setLocale } = useI18n();
  const router = useRouter();

  function onLogout(): void {
    clearTokens();
    router.replace('/login');
    router.refresh();
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4">
      <div className="flex items-center gap-3 lg:hidden">
        {MOBILE_NAV_KEYS.map(([key, href]) => (
          <Link key={href} href={href} className="text-sm font-medium text-brand-700">
            {t(`nav.${key}`)}
          </Link>
        ))}
      </div>
      <span className="hidden text-sm font-semibold text-slate-700 lg:block">
        {t('common.appName')}
      </span>
      <div className="ms-auto flex items-center gap-3">
        <select
          aria-label={t('common.locale')}
          className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
        >
          {locales.map((l) => (
            <option key={l} value={l}>
              {l === 'ar' ? 'العربية' : 'English'}
            </option>
          ))}
        </select>
        <button onClick={onLogout} className="btn-ghost">
          {t('common.logout')}
        </button>
      </div>
    </header>
  );
}