'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n-client';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';

interface LeaveRequest {
  id: string;
  status: string;
  from: string;
  to: string;
  employee?: { employeeNumber: string; firstName: string; lastName: string } | null;
  leaveType?: { name: string } | null;
}

interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export default function LeavePage(): React.JSX.Element {
  const { t } = useI18n();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);

  const load = useCallback(() => {
    api<Paged<LeaveRequest>>('/leave/requests')
      .then((r) => setRequests(r.items))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(id: string, decision: 'APPROVED' | 'REJECTED'): Promise<void> {
    await api(`/leave/requests/${id}/decide`, { method: 'POST', body: { decision, note: 'web' } })
      .then(() => load())
      .catch(() => {});
  }

  return (
    <div>
      <PageHeader title={t('leave.title')} />
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>{t('leave.employee')}</th>
              <th>{t('leave.type')}</th>
              <th>{t('leave.from')}</th>
              <th>{t('leave.to')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td className="text-slate-900">
                  {r.employee ? `${r.employee.employeeNumber} · ${r.employee.firstName} ${r.employee.lastName}` : '—'}
                </td>
                <td className="text-slate-500">{r.leaveType?.name ?? '—'}</td>
                <td dir="ltr" className="text-slate-500">{r.from.slice(0, 10)}</td>
                <td dir="ltr" className="text-slate-500">{r.to.slice(0, 10)}</td>
                <td>
                  <StatusBadge value={r.status} />
                </td>
                <td>
                  {r.status === 'PENDING' ? (
                    <div className="flex gap-2">
                      <button className="btn-primary px-3 py-1 text-xs" onClick={() => void decide(r.id, 'APPROVED')}>
                        {t('leave.approve')}
                      </button>
                      <button className="btn-ghost px-3 py-1 text-xs" onClick={() => void decide(r.id, 'REJECTED')}>
                        {t('leave.reject')}
                      </button>
                    </div>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
              </tr>
            ))}
            {requests.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-400">
                  {t('common.noData')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}