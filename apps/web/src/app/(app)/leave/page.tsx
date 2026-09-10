'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n-client';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Modal } from '@/components/Modal';

interface LeaveRequest {
  id: string;
  status: string;
  from: string;
  to: string;
  halfDay: boolean;
  note: string | null;
  employee?: { employeeNumber: string; firstName: string; lastName: string } | null;
  leaveType?: { name: string } | null;
}

interface LeaveType {
  id: string;
  name: string;
  code: string;
}

interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

const EMPTY_FORM = {
  leaveTypeId: '',
  from: '',
  to: '',
  halfDay: false,
  note: '',
};

export default function LeavePage(): React.JSX.Element {
  const { t } = useI18n();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'all' | 'my'>('all');

  const load = useCallback(() => {
    const endpoint = tab === 'my' ? '/leave/requests?mine=true' : '/leave/requests';
    api<Paged<LeaveRequest>>(endpoint)
      .then((r) => setRequests(r.items))
      .catch(() => {});
    api<LeaveType[]>('/leave/types')
      .then((r) => setLeaveTypes(r))
      .catch(() => {});
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  function set<K extends keyof typeof EMPTY_FORM>(key: K, value: string | boolean): void {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function addRequest(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api<LeaveRequest>('/leave/requests', {
        method: 'POST',
        body: {
          leaveTypeId: form.leaveTypeId,
          from: form.from,
          to: form.to,
          halfDay: form.halfDay,
          note: form.note || undefined,
        },
      });
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
      load();
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) {
        const first = Object.values(err.fieldErrors)[0];
        setError(String(first));
      } else {
        setError(err instanceof Error ? err.message : t('common.error'));
      }
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: string, decision: 'APPROVED' | 'REJECTED'): Promise<void> {
    await api(`/leave/requests/${id}/decide`, { method: 'POST', body: { decision, note: 'web' } })
      .then(() => load())
      .catch(() => {});
  }

  function statusLabel(status: string): string {
    const key = status.toLowerCase() as 'pending' | 'approved' | 'rejected';
    return t(`leave.${key}`);
  }

  return (
    <div>
      <PageHeader
        title={t('leave.title')}
        action={
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            + {t('leave.add')}
          </button>
        }
      />
      <div className="mb-4 flex gap-2">
        <button
          className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
            tab === 'all'
              ? 'bg-brand-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
          onClick={() => setTab('all')}
        >
          {t('leave.pending')}
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
            tab === 'my'
              ? 'bg-brand-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
          onClick={() => setTab('my')}
        >
          {t('leave.myRequests')}
        </button>
      </div>
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>{t('leave.employee')}</th>
              <th>{t('leave.type')}</th>
              <th>{t('leave.from')}</th>
              <th>{t('leave.to')}</th>
              <th>{t('leave.halfDay')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td className="text-slate-900">
                  {r.employee
                    ? `${r.employee.employeeNumber} · ${r.employee.firstName} ${r.employee.lastName}`
                    : '—'}
                </td>
                <td className="text-slate-500">{r.leaveType?.name ?? '—'}</td>
                <td dir="ltr" className="text-slate-500">
                  {r.from.slice(0, 10)}
                </td>
                <td dir="ltr" className="text-slate-500">
                  {r.to.slice(0, 10)}
                </td>
                <td className="text-slate-500">
                  {r.halfDay ? (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                      {t('leave.halfDay')}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td>
                  <StatusBadge value={r.status} />
                </td>
                <td>
                  {r.status === 'PENDING' ? (
                    <div className="flex gap-2">
                      <button
                        className="btn-primary px-3 py-1 text-xs"
                        onClick={() => void decide(r.id, 'APPROVED')}
                      >
                        {t('leave.approve')}
                      </button>
                      <button
                        className="btn-ghost px-3 py-1 text-xs"
                        onClick={() => void decide(r.id, 'REJECTED')}
                      >
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
                <td colSpan={7} className="py-6 text-center text-slate-400">
                  {t('common.noData')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} title={t('leave.add')} onClose={() => setShowForm(false)}>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              {t('leave.leaveType')}
            </label>
            <select
              className="input"
              value={form.leaveTypeId}
              onChange={(e) => set('leaveTypeId', e.target.value)}
              required
            >
              <option value="">{t('leave.selectLeaveType')}</option>
              {leaveTypes.map((lt) => (
                <option key={lt.id} value={lt.id}>
                  {lt.name} ({lt.code})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                {t('leave.from')}
              </label>
              <input
                className="input"
                type="date"
                value={form.from}
                onChange={(e) => set('from', e.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                {t('leave.to')}
              </label>
              <input
                className="input"
                type="date"
                value={form.to}
                onChange={(e) => set('to', e.target.value)}
                required
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="halfDay"
              checked={form.halfDay}
              onChange={(e) => set('halfDay', e.target.checked)}
              className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <label htmlFor="halfDay" className="text-sm text-slate-700">
              {t('leave.halfDayNote')}
            </label>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              {t('leave.requestNote')}
            </label>
            <textarea
              className="input"
              rows={3}
              value={form.note}
              onChange={(e) => set('note', e.target.value)}
              placeholder={t('leave.requestNote')}
            />
          </div>
          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <button className="btn-ghost" onClick={() => setShowForm(false)}>
              {t('leave.cancel')}
            </button>
            <button className="btn-primary" disabled={busy} onClick={() => void addRequest()}>
              {busy ? t('common.loading') : t('leave.submit')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}