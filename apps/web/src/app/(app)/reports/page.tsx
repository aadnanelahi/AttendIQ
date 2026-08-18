'use client';

import { useState } from 'react';
import { API_URL, getToken } from '@/lib/api';
import { useI18n } from '@/lib/i18n-client';
import { PageHeader } from '@/components/PageHeader';

export default function ReportsPage(): React.JSX.Element {
  const { t } = useI18n();
  const [from, setFrom] = useState('2000-01-01');
  const [to, setTo] = useState('2999-12-31');
  const [busy, setBusy] = useState(false);

  async function exportCsv(): Promise<void> {
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/reports/attendance?from=${from}&to=${to}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'attendance-report.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // no-op
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title={t('reports.title')} />
      <div className="card max-w-xl space-y-4">
        <h2 className="text-sm font-semibold text-slate-700">{t('reports.attendance')}</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">{t('reports.from')}</label>
            <input type="date" className="input" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">{t('reports.to')}</label>
            <input type="date" className="input" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <button className="btn-primary" disabled={busy} onClick={() => void exportCsv()}>
          {busy ? t('common.loading') : t('reports.exportCsv')}
        </button>
      </div>
    </div>
  );
}