'use client';

import { useTabs } from '@/lib/tabs';
import { NAV_ITEMS } from '@/lib/routes';
import { useI18n } from '@/lib/i18n-client';

export function Sidebar(): React.JSX.Element {
  const { t } = useI18n();
  const { isActive, openTab } = useTabs();

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-e border-slate-200 bg-white lg:flex">
      <div className="flex h-14 items-center border-b border-slate-200 px-4">
        <button
          className="text-lg font-bold text-brand-700"
          onClick={() => openTab('/dashboard')}
        >
          {t('common.appName')}
        </button>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => openTab(item.path)}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-sm font-medium transition ${
                active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {t(`nav.${item.navKey}`)}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}