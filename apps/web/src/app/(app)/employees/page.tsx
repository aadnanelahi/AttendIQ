'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n-client';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Modal } from '@/components/Modal';

interface Employee {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string | null;
  employmentStatus: string;
  designation?: string | null;
  department?: { id: string; name: string } | null;
}

interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface Department {
  id: string;
  name: string;
}

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  employeeNumber: '',
  email: '',
  phone: '',
  gender: '',
  employmentStatus: 'ACTIVE',
  designation: '',
  departmentId: '',
  joiningDate: '',
  deviceUserId: '',
};

export default function EmployeesPage(): React.JSX.Element {
  const { t } = useI18n();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Paged<Employee>>('/employees')
      .then((r) => setEmployees(r.items))
      .catch(() => {});
    api<Department[]>('/departments')
      .then(setDepartments)
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function set<K extends keyof typeof EMPTY_FORM>(key: K, value: string): void {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function addEmployee(): Promise<void> {
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = {
      firstName: form.firstName,
      lastName: form.lastName,
      employeeNumber: form.employeeNumber,
      email: form.email || undefined,
      phone: form.phone || undefined,
      gender: form.gender || undefined,
      employmentStatus: form.employmentStatus,
      designation: form.designation || undefined,
      departmentId: form.departmentId || undefined,
      joiningDate: form.joiningDate || undefined,
      deviceUserId: form.deviceUserId || undefined,
    };
    try {
      await api<Employee>('/employees', { method: 'POST', body });
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

  return (
    <div>
      <PageHeader
        title={t('employees.title')}
        action={
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            + {t('employees.add')}
          </button>
        }
      />
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>{t('employees.employeeNumber')}</th>
              <th>{t('employees.name')}</th>
              <th>{t('employees.email')}</th>
              <th>{t('employees.department')}</th>
              <th>{t('employees.position')}</th>
              <th>{t('common.status')}</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id}>
                <td className="font-medium text-slate-900">{e.employeeNumber}</td>
                <td>
                  {e.firstName} {e.lastName}
                </td>
                <td className="text-slate-500">{e.email ?? 'â€”'}</td>
                <td className="text-slate-500">{e.department?.name ?? 'â€”'}</td>
                <td className="text-slate-500">{e.designation ?? 'â€”'}</td>
                <td>
                  <StatusBadge value={e.employmentStatus} />
                </td>
              </tr>
            ))}
            {employees.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-400">
                  {t('common.noData')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} title={t('employees.add')} onClose={() => setShowForm(false)}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('employees.firstName')}</label>
              <input className="input" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('employees.lastName')}</label>
              <input className="input" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t('employees.employeeNumber')}</label>
            <input className="input" dir="ltr" value={form.employeeNumber} onChange={(e) => set('employeeNumber', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('employees.email')}</label>
              <input className="input" dir="ltr" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('employees.phone')}</label>
              <input className="input" dir="ltr" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('employees.gender')}</label>
              <select className="input" value={form.gender} onChange={(e) => set('gender', e.target.value)}>
                <option value="">â€”</option>
                <option value="MALE">{t('employees.male')}</option>
                <option value="FEMALE">{t('employees.female')}</option>
                <option value="OTHER">{t('employees.other')}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('employees.status')}</label>
              <select className="input" value={form.employmentStatus} onChange={(e) => set('employmentStatus', e.target.value)}>
                <option value="ACTIVE">{t('status.ACTIVE')}</option>
                <option value="INACTIVE">{t('status.INACTIVE')}</option>
                <option value="ON_LEAVE">{t('status.ON_LEAVE')}</option>
                <option value="SUSPENDED">{t('status.SUSPENDED')}</option>
                <option value="TERMINATED">{t('status.TERMINATED')}</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('employees.department')}</label>
              <select className="input" value={form.departmentId} onChange={(e) => set('departmentId', e.target.value)}>
                <option value="">â€”</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('employees.position')}</label>
              <input className="input" value={form.designation} onChange={(e) => set('designation', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('employees.hireDate')}</label>
              <input className="input" dir="ltr" type="date" value={form.joiningDate} onChange={(e) => set('joiningDate', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('employees.deviceUserId')}</label>
              <input className="input" dir="ltr" placeholder="e.g. 9003" value={form.deviceUserId} onChange={(e) => set('deviceUserId', e.target.value)} />
            </div>
          </div>
          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <button className="btn-ghost" onClick={() => setShowForm(false)}>
              {t('common.cancel')}
            </button>
            <button className="btn-primary" disabled={busy} onClick={() => void addEmployee()}>
              {busy ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
