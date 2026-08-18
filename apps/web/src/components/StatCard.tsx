'use client';

import { useI18n } from '@/lib/i18n-client';

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
}

export function StatCard({ label, value, hint }: StatCardProps): React.JSX.Element {
  const { t } = useI18n();
  return (
    <div className="card">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint ?? t('common.noData')}</p> : null}
    </div>
  );
}
