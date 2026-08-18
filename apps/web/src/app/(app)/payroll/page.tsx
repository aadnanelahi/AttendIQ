'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n-client';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';

interface PayrollPeriod {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  currency: string;
  status: string;
}

interface PayrollRun {
  id: string;
  status: string;
  ruleVersion: string;
  period?: PayrollPeriod | null;
  _count?: { items: number } | null;
  totals?: { net: number; gross: number; count: number } | null;
}

interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

const periodFrom = () => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;

export default function PayrollPage(): React.JSX.Element {
  const { t } = useI18n();
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);

  const load = useCallback(() => {
    api<Paged<PayrollPeriod>>('/payroll/periods')
      .then((r) => setPeriods(r.items))
      .catch(() => {});
    api<Paged<PayrollRun>>('/payroll/runs')
      .then((r) => setRuns(r.items))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createPeriod(): Promise<void> {
    const to = `${periodFrom().slice(0, 8)}28`;
    await api<PayrollPeriod>('/payroll/periods', {
      method: 'POST',
      body: { name: periodFrom(), startDate: periodFrom(), endDate: to },
    })
      .then(() => load())
      .catch(() => {});
  }

  async function runPayroll(periodId: string): Promise<void> {
    await api('/payroll/runs', { method: 'POST', body: { periodId } })
      .then(() => load())
      .catch(() => {});
  }

  return (
    <div>
      <PageHeader
        title={t('payroll.title')}
        action={
          <button className="btn-primary" onClick={() => void createPeriod()}>
            + {t('payroll.periods')}
          </button>
        }
      />
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card overflow-x-auto">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">{t('payroll.periods')}</h2>
          <table className="table-base">
            <thead>
              <tr>
                <th>{t('payroll.name')}</th>
                <th>{t('payroll.startDate')}</th>
                <th>{t('payroll.endDate')}</th>
                <th>{t('common.status')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium text-slate-900">{p.name}</td>
                  <td dir="ltr" className="text-slate-500">{p.startDate.slice(0, 10)}</td>
                  <td dir="ltr" className="text-slate-500">{p.endDate.slice(0, 10)}</td>
                  <td>
                    <StatusBadge value={p.status} />
                  </td>
                  <td>
                    {p.status === 'OPEN' ? (
                      <button className="btn-primary px-3 py-1 text-xs" onClick={() => void runPayroll(p.id)}>
                        {t('payroll.run')}
                      </button>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {periods.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">
                    {t('common.noData')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="card overflow-x-auto">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">{t('payroll.runs')}</h2>
          <table className="table-base">
            <thead>
              <tr>
                <th>{t('payroll.periods')}</th>
                <th>{t('common.status')}</th>
                <th>{t('payroll.net')}</th>
                <th>{t('payroll.items')}</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium text-slate-900">{r.period?.name ?? r.id.slice(0, 8)}</td>
                  <td>
                    <StatusBadge value={r.status} />
                  </td>
                  <td dir="ltr" className="text-slate-500">
                    {r.totals ? `${r.totals.net.toLocaleString()} ${r.period?.currency ?? 'AED'}` : '—'}
                  </td>
                  <td className="text-slate-500">{r._count?.items ?? 0}</td>
                </tr>
              ))}
              {runs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-400">
                    {t('common.noData')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}