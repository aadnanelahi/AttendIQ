'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n-client';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';

interface Summary {
  counts: { employees: number; devices: number };
  attendance: {
    days: number;
    byStatus: Record<string, number>;
    lateMinutes: number;
    overtimeMinutes: number;
  };
  pending: { leave: number; adjustments: number; overtime: number; visits: number };
}

export default function DashboardPage(): React.JSX.Element {
  const { t } = useI18n();
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    api<Summary>('/reports/summary')
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  return (
    <div>
      <PageHeader title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('dashboard.employees')} value={summary?.counts.employees ?? 0} />
        <StatCard label={t('dashboard.devices')} value={summary?.counts.devices ?? 0} />
        <StatCard label={t('dashboard.attendanceDays')} value={summary?.attendance.days ?? 0} />
        <StatCard label={t('dashboard.pendingLeave')} value={summary?.pending.leave ?? 0} />
        <StatCard label={t('dashboard.lateMinutes')} value={summary?.attendance.lateMinutes ?? 0} />
        <StatCard label={t('dashboard.overtimeMinutes')} value={summary?.attendance.overtimeMinutes ?? 0} />
      </div>
      {summary ? (
        <div className="card mt-6">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">{t('dashboard.byStatus')}</h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(summary.attendance.byStatus).map(([status, count]) => (
              <span key={status} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm">
                {t(`status.${status}`)}: <strong>{count}</strong>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}