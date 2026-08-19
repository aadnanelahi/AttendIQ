'use client';

import { useTabs } from '@/lib/tabs';
import { useI18n } from '@/lib/i18n-client';

export function TabsBar(): React.JSX.Element | null {
  const { tabs, activePath, openTab, closeTab } = useTabs();
  const { t } = useI18n();

  if (tabs.length === 0) return null;

  return (
    <div className="flex items-end gap-1 overflow-x-auto border-b border-slate-200 bg-slate-100 px-2 pt-2">
      {tabs.map((tab) => {
        const active = tab.path === activePath;
        const label = t(`nav.${tab.navKey}`) ?? tab.navKey;
        return (
          <div
            key={tab.id}
            className={`group flex shrink-0 cursor-pointer items-center gap-2 rounded-t-lg border border-b-0 px-3 py-1.5 text-sm transition ${
              active
                ? 'border-slate-200 bg-white font-medium text-brand-700'
                : 'border-transparent text-slate-500 hover:bg-slate-200/60 hover:text-slate-700'
            }`}
            onClick={() => openTab(tab.path)}
          >
            <span>{label}</span>
            <button
              aria-label="close"
              className="flex h-4 w-4 items-center justify-center rounded text-slate-400 hover:bg-slate-300/70 hover:text-slate-700"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
