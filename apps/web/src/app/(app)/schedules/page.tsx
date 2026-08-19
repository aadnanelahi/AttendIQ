'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n-client';
import { PageHeader } from '@/components/PageHeader';
import { Modal } from '@/components/Modal';

type SubTab = 'shifts' | 'assignments';

interface Shift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  graceInMinutes: number;
  graceOutMinutes: number;
  breakMinutes: number;
  lateAllowedMinutes: number;
  earlyLeaveAllowedMinutes: number;
  requiredHoursMinutes: number | null;
  isFlexible: boolean;
  isRotating: boolean;
  restDay: boolean;
}

interface EmployeeRef {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
}

interface EmployeeSchedule {
  id: string;
  employee: EmployeeRef;
  shift: Shift | null;
  effectiveFrom: string;
  effectiveTo: string | null;
}

interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

const EMPTY_SHIFT = {
  name: '',
  startTime: '09:00',
  endTime: '18:00',
  crossesMidnight: false,
  graceInMinutes: '0',
  graceOutMinutes: '0',
  breakMinutes: '0',
  lateAllowedMinutes: '0',
  earlyLeaveAllowedMinutes: '0',
  requiredHoursMinutes: '',
  isFlexible: false,
  isRotating: false,
  restDay: false,
};

export default function SchedulesPage(): React.JSX.Element {
  const { t } = useI18n();
  const [tab, setTab] = useState<SubTab>('shifts');

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [assignments, setAssignments] = useState<EmployeeSchedule[]>([]);
  const [employees, setEmployees] = useState<EmployeeRef[]>([]);

  const [form, setForm] = useState({ ...EMPTY_SHIFT });
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [assignForm, setAssignForm] = useState({ employeeId: '', shiftId: '', effectiveFrom: '', effectiveTo: '' });

  const loadShifts = useCallback(() => {
    api<Paged<Shift>>('/shifts')
      .then((r) => setShifts(r.items))
      .catch(() => {});
  }, []);

  const loadAssignments = useCallback(() => {
    api<Paged<EmployeeSchedule>>('/employee-schedules')
      .then((r) => setAssignments(r.items))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadShifts();
    loadAssignments();
    api<Paged<EmployeeRef>>('/employees?pageSize=100')
      .then((r) => setEmployees(r.items))
      .catch(() => {});
  }, [loadShifts, loadAssignments]);

  function set<K extends keyof typeof EMPTY_SHIFT>(key: K, value: string | boolean): void {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function addShift(): Promise<void> {
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = {
      name: form.name,
      startTime: form.startTime,
      endTime: form.endTime,
      crossesMidnight: form.crossesMidnight,
      graceInMinutes: Number(form.graceInMinutes),
      graceOutMinutes: Number(form.graceOutMinutes),
      breakMinutes: Number(form.breakMinutes),
      lateAllowedMinutes: Number(form.lateAllowedMinutes),
      earlyLeaveAllowedMinutes: Number(form.earlyLeaveAllowedMinutes),
      requiredHoursMinutes: form.requiredHoursMinutes ? Number(form.requiredHoursMinutes) : undefined,
      isFlexible: form.isFlexible,
      isRotating: form.isRotating,
      restDay: form.restDay,
    };
    try {
      await api<Shift>('/shifts', { method: 'POST', body });
      setShowForm(false);
      setForm({ ...EMPTY_SHIFT });
      loadShifts();
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

  async function removeShift(id: string): Promise<void> {
    if (!window.confirm('Delete this shift?')) return;
    await api(`/shifts/${id}`, { method: 'DELETE' })
      .then(loadShifts)
      .catch(() => {});
  }

  async function addAssignment(): Promise<void> {
    if (!assignForm.employeeId || !assignForm.shiftId || !assignForm.effectiveFrom) return;
    setBusy(true);
    setError(null);
    try {
      await api<EmployeeSchedule>('/employee-schedules', {
        method: 'POST',
        body: {
          employeeId: assignForm.employeeId,
          shiftId: assignForm.shiftId,
          effectiveFrom: assignForm.effectiveFrom,
          effectiveTo: assignForm.effectiveTo || undefined,
        },
      });
      setAssignForm({ employeeId: '', shiftId: '', effectiveFrom: '', effectiveTo: '' });
      loadAssignments();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  async function removeAssignment(id: string): Promise<void> {
    if (!window.confirm('Delete this assignment?')) return;
    await api(`/employee-schedules/${id}`, { method: 'DELETE' })
      .then(loadAssignments)
      .catch(() => {});
  }

  const tabs: { key: SubTab; label: string }[] = [
    { key: 'shifts', label: t('schedules.shifts') },
    { key: 'assignments', label: t('schedules.assignments') },
  ];

  return (
    <div>
      <PageHeader
        title={t('schedules.title')}
        action={
          tab === 'shifts' ? (
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              + {t('schedules.addShift')}
            </button>
          ) : undefined
        }
      />
      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {tabs.map((x) => (
          <button
            key={x.key}
            onClick={() => setTab(x.key)}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === x.key
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {x.label}
          </button>
        ))}
      </div>

      {/* --- Shifts --- */}
      {tab === 'shifts' ? (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>{t('schedules.name')}</th>
                <th>{t('schedules.startTime')}</th>
                <th>{t('schedules.endTime')}</th>
                <th>{t('schedules.crossesMidnight')}</th>
                <th>{t('schedules.graceIn')}</th>
                <th>{t('schedules.graceOut')}</th>
                <th>{t('schedules.breakMinutes')}</th>
                <th>{t('schedules.lateAllowed')}</th>
                <th>{t('schedules.earlyLeaveAllowed')}</th>
                <th>{t('schedules.requiredHours')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((s) => (
                <tr key={s.id}>
                  <td className="font-medium text-slate-900">{s.name}</td>
                  <td className="font-mono text-xs text-slate-700" dir="ltr">{s.startTime}</td>
                  <td className="font-mono text-xs text-slate-700" dir="ltr">{s.endTime}</td>
                  <td className="text-slate-500">{s.crossesMidnight ? '✓' : '—'}</td>
                  <td className="text-slate-500">{s.graceInMinutes}</td>
                  <td className="text-slate-500">{s.graceOutMinutes}</td>
                  <td className="text-slate-500">{s.breakMinutes}</td>
                  <td className="text-slate-500">{s.lateAllowedMinutes}</td>
                  <td className="text-slate-500">{s.earlyLeaveAllowedMinutes}</td>
                  <td className="text-slate-500">{s.requiredHoursMinutes ?? '—'}</td>
                  <td>
                    <button className="btn-ghost px-3 py-1 text-xs text-red-600" onClick={() => void removeShift(s.id)}>
                      {t('common.delete')}
                    </button>
                  </td>
                </tr>
              ))}
              {shifts.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-6 text-center text-slate-400">
                    {t('common.noData')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* --- Assignments --- */}
      {tab === 'assignments' ? (
        <div className="card space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
            <select
              className="input"
              value={assignForm.employeeId}
              onChange={(e) => setAssignForm({ ...assignForm, employeeId: e.target.value })}
            >
              <option value="">{t('schedules.employee')}</option>
              {employees.map((em) => (
                <option key={em.id} value={em.id}>
                  {em.employeeNumber} — {em.firstName} {em.lastName}
                </option>
              ))}
            </select>
            <select
              className="input"
              value={assignForm.shiftId}
              onChange={(e) => setAssignForm({ ...assignForm, shiftId: e.target.value })}
            >
              <option value="">{t('schedules.shift')}</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <input
              className="input"
              dir="ltr"
              type="date"
              value={assignForm.effectiveFrom}
              onChange={(e) => setAssignForm({ ...assignForm, effectiveFrom: e.target.value })}
              placeholder={t('schedules.effectiveFrom')}
            />
            <input
              className="input"
              dir="ltr"
              type="date"
              value={assignForm.effectiveTo}
              onChange={(e) => setAssignForm({ ...assignForm, effectiveTo: e.target.value })}
              placeholder={t('schedules.effectiveTo')}
            />
            <button
              className="btn-primary"
              disabled={busy || !assignForm.employeeId || !assignForm.shiftId || !assignForm.effectiveFrom}
              onClick={() => void addAssignment()}
            >
              + {t('schedules.assign')}
            </button>
          </div>
          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}
          <table className="table-base">
            <thead>
              <tr>
                <th>{t('schedules.assignedTo')}</th>
                <th>{t('schedules.shift')}</th>
                <th>{t('schedules.effectiveFrom')}</th>
                <th>{t('schedules.effectiveTo')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id}>
                  <td className="font-medium text-slate-900">
                    {a.employee.employeeNumber} — {a.employee.firstName} {a.employee.lastName}
                  </td>
                  <td className="text-slate-500">{a.shift?.name ?? '—'}</td>
                  <td className="font-mono text-xs text-slate-700" dir="ltr">{a.effectiveFrom.slice(0, 10)}</td>
                  <td className="font-mono text-xs text-slate-700" dir="ltr">{a.effectiveTo ? a.effectiveTo.slice(0, 10) : '—'}</td>
                  <td>
                    <button className="btn-ghost px-3 py-1 text-xs text-red-600" onClick={() => void removeAssignment(a.id)}>
                      {t('common.delete')}
                    </button>
                  </td>
                </tr>
              ))}
              {assignments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">
                    {t('common.noData')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Add shift */}
      <Modal open={showForm} title={t('schedules.addShift')} onClose={() => setShowForm(false)}>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t('schedules.name')}</label>
            <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('schedules.startTime')}</label>
              <input className="input" dir="ltr" type="time" value={form.startTime} onChange={(e) => set('startTime', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('schedules.endTime')}</label>
              <input className="input" dir="ltr" type="time" value={form.endTime} onChange={(e) => set('endTime', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('schedules.graceIn')}</label>
              <input className="input" dir="ltr" type="number" value={form.graceInMinutes} onChange={(e) => set('graceInMinutes', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('schedules.graceOut')}</label>
              <input className="input" dir="ltr" type="number" value={form.graceOutMinutes} onChange={(e) => set('graceOutMinutes', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('schedules.breakMinutes')}</label>
              <input className="input" dir="ltr" type="number" value={form.breakMinutes} onChange={(e) => set('breakMinutes', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('schedules.lateAllowed')}</label>
              <input className="input" dir="ltr" type="number" value={form.lateAllowedMinutes} onChange={(e) => set('lateAllowedMinutes', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('schedules.earlyLeaveAllowed')}</label>
              <input className="input" dir="ltr" type="number" value={form.earlyLeaveAllowedMinutes} onChange={(e) => set('earlyLeaveAllowedMinutes', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t('schedules.requiredHours')}</label>
            <input className="input" dir="ltr" type="number" value={form.requiredHoursMinutes} onChange={(e) => set('requiredHoursMinutes', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {([
              ['crossesMidnight', t('schedules.crossesMidnight')],
              ['isFlexible', t('schedules.isFlexible')],
              ['isRotating', t('schedules.isRotating')],
              ['restDay', t('schedules.restDay')],
            ] as [keyof typeof EMPTY_SHIFT, string][]).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={Boolean(form[key])} onChange={(e) => set(key, e.target.checked)} />
                {label}
              </label>
            ))}
          </div>
          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <button className="btn-ghost" onClick={() => setShowForm(false)}>
              {t('common.cancel')}
            </button>
            <button className="btn-primary" disabled={busy || !form.name} onClick={() => void addShift()}>
              {busy ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
