'use client';

import { useI18n } from '@/lib/i18n-client';

const toneMap: Record<string, string> = {
  PRESENT: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ONLINE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PROCESSED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  LATE: 'bg-amber-50 text-amber-700 border-amber-200',
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  OPEN: 'bg-amber-50 text-amber-700 border-amber-200',
  LOCKED: 'bg-slate-100 text-slate-700 border-slate-200',
  DRAFT: 'bg-slate-100 text-slate-700 border-slate-200',
  ABSENT: 'bg-red-50 text-red-700 border-red-200',
  REJECTED: 'bg-red-50 text-red-700 border-red-200',
  INACTIVE: 'bg-slate-100 text-slate-600 border-slate-200',
  OFFLINE: 'bg-slate-100 text-slate-600 border-slate-200',
};

export function StatusBadge({ value }: { value?: string | null }): React.JSX.Element | null {
  const { t } = useI18n();
  if (!value) return null;
  const tone = toneMap[value] ?? 'bg-slate-100 text-slate-700 border-slate-200';
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>
      {t(`status.${value}`) ?? value}
    </span>
  );
}
