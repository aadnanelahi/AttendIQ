'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n-client';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Modal } from '@/components/Modal';

type SubTab = 'employees' | 'departments';

interface Employee {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string | null;
  employmentStatus: string;
  designation?: string | null;
  department?: { id: string; name: string } | null;
  location?: { id: string; name: string } | null;
}

interface Department {
  id: string;
  name: string;
  code: string | null;
  branchId?: string | null;
}

interface Location {
  id: string;
  name: string;
}

interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

const EMPTY_EMPLOYEE_FORM = {
  id: '',
  firstName: '',
  lastName: '',
  employeeNumber: '',
  email: '',
  phone: '',
  gender: '',
  employmentStatus: 'ACTIVE',
  designation: '',
  departmentId: '',
  locationId: '',
  joiningDate: '',
  deviceUserId: '',
};

const EMPTY_DEPARTMENT_FORM = {
  id: '',
  name: '',
  code: '',
  branchId: '',
};

export default function EmployeesPage(): React.JSX.Element {
  const { t } = useI18n();
  const [tab, setTab] = useState<SubTab>('employees');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [form, setForm] = useState({ ...EMPTY_EMPLOYEE_FORM });
  const [deptForm, setDeptForm] = useState({ ...EMPTY_DEPARTMENT_FORM });
  const [showForm, setShowForm] = useState(false);
  const [showDeptForm, setShowDeptForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deptBusy, setDeptBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deptError, setDeptError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);

  const loadEmployees = useCallback(() => {
    api<Paged<Employee>>('/employees')
      .then((r) => setEmployees(r.items))
      .catch(() => {});
  }, []);

  const loadDepartments = useCallback(() => {
    api<Department[]>('/departments')
      .then(setDepartments)
      .catch(() => {});
  }, []);

  const loadLocations = useCallback(() => {
    api<Paged<Location>>('/locations')
      .then((r) => setLocations(r.items))
      .catch(() => {});
  }, []);

  const loadAll = useCallback(() => {
    loadEmployees();
    loadDepartments();
    loadLocations();
  }, [loadEmployees, loadDepartments, loadLocations]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  function setEmp<K extends keyof typeof EMPTY_EMPLOYEE_FORM>(key: K, value: string): void {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setDept<K extends keyof typeof EMPTY_DEPARTMENT_FORM>(key: K, value: string): void {
    setDeptForm((f) => ({ ...f, [key]: value }));
  }

  function openAddEmployee(): void {
    setEditingId(null);
    setForm({ ...EMPTY_EMPLOYEE_FORM });
    setShowForm(true);
  }

  function openEditEmployee(e: Employee): void {
    setEditingId(e.id);
    setForm({
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      employeeNumber: e.employeeNumber,
      email: e.email ?? '',
      phone: '',
      gender: '',
      employmentStatus: e.employmentStatus,
      designation: e.designation ?? '',
      departmentId: e.department?.id ?? '',
      locationId: e.location?.id ?? '',
      joiningDate: '',
      deviceUserId: '',
    });
    setShowForm(true);
  }

  function openAddDepartment(): void {
    setEditingDeptId(null);
    setDeptForm({ ...EMPTY_DEPARTMENT_FORM });
    setShowDeptForm(true);
  }

  function openEditDepartment(d: Department): void {
    setEditingDeptId(d.id);
    setDeptForm({
      id: d.id,
      name: d.name,
      code: d.code ?? '',
      branchId: d.branchId ?? '',
    });
    setShowDeptForm(true);
  }

  async function saveEmployee(): Promise<void> {
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
      locationId: form.locationId || undefined,
      joiningDate: form.joiningDate || undefined,
      deviceUserId: form.deviceUserId || undefined,
    };
    try {
      if (editingId) {
        await api<Employee>(`/employees/${editingId}`, { method: 'PUT', body });
      } else {
        await api<Employee>('/employees', { method: 'POST', body });
      }
      setShowForm(false);
      setForm({ ...EMPTY_EMPLOYEE_FORM });
      setEditingId(null);
      loadEmployees();
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

  async function saveDepartment(): Promise<void> {
    setDeptBusy(true);
    setDeptError(null);
    const body: Record<string, unknown> = {
      name: deptForm.name,
      code: deptForm.code || undefined,
      branchId: deptForm.branchId || undefined,
    };
    try {
      if (editingDeptId) {
        await api<Department>(`/departments/${editingDeptId}`, { method: 'PUT', body });
      } else {
        await api<Department>('/departments', { method: 'POST', body });
      }
      setShowDeptForm(false);
      setDeptForm({ ...EMPTY_DEPARTMENT_FORM });
      setEditingDeptId(null);
      loadDepartments();
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) {
        const first = Object.values(err.fieldErrors)[0];
        setDeptError(String(first));
      } else {
        setDeptError(err instanceof Error ? err.message : t('common.error'));
      }
    } finally {
      setDeptBusy(false);
    }
  }

  async function deleteEmployee(id: string): Promise<void> {
    if (!window.confirm('Delete this employee?')) return;
    await api(`/employees/${id}`, { method: 'DELETE' })
      .then(() => loadEmployees())
      .catch(() => {});
  }

  async function deleteDepartment(id: string): Promise<void> {
    if (!window.confirm('Delete this department?')) return;
    await api(`/departments/${id}`, { method: 'DELETE' })
      .then(() => loadDepartments())
      .catch(() => {});
  }

  const tabs: { key: SubTab; label: string }[] = [
    { key: 'employees', label: t('employees.title') },
    { key: 'departments', label: t('departments.title') },
  ];

return (
    <div>
      <PageHeader
        title={t(tab === 'employees' ? 'employees.title' : 'departments.title')}
        action={
          tab === 'employees' ? (
            <button className="btn-primary" onClick={openAddEmployee}>
              + {t('employees.add')}
            </button>
          ) : (
            <button className="btn-primary" onClick={openAddDepartment}>
              + {t('departments.add')}
            </button>
          )
        }
      ></PageHeader>
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

      {/* --- Employees --- */}
      {tab === 'employees' ? (
        <div className="card space-y-4">
          <div className="card overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>{t('employees.employeeNumber')}</th>
                  <th>{t('employees.name')}</th>
                  <th>{t('employees.email')}</th>
                  <th>{t('employees.department')}</th>
                  <th>{t('employees.site')}</th>
                  <th>{t('employees.position')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={e.id}>
                    <td className="font-medium text-slate-900">{e.employeeNumber}</td>
                    <td>{e.firstName} {e.lastName}</td>
                    <td className="text-slate-500">{e.email ?? '—'}</td>
                    <td className="text-slate-500">{e.department?.name ?? '—'}</td>
                    <td className="text-slate-500">{e.location?.name ?? '—'}</td>
                    <td className="text-slate-500">{e.designation ?? '—'}</td>
                    <td>
                      <StatusBadge value={e.employmentStatus} />
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <button
                          className="btn-ghost px-3 py-1 text-xs"
                          onClick={() => openEditEmployee(e)}
                        >
                          {t('employees.edit')}
                        </button>
                        <button
                          className="btn-ghost px-3 py-1 text-xs text-red-600"
                          onClick={() => void deleteEmployee(e.id)}
                        >
                          {t('common.delete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {employees.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-slate-400">
                      {t('common.noData')}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <Modal open={showForm} title={editingId ? t('employees.edit') : t('employees.add')} onClose={() => { setShowForm(false); setEditingId(null); }}>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">{t('employees.firstName')}</label>
                  <input className="input" value={form.firstName} onChange={(e) => setEmp('firstName', e.target.value)} required />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">{t('employees.lastName')}</label>
                  <input className="input" value={form.lastName} onChange={(e) => setEmp('lastName', e.target.value)} required />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{t('employees.employeeNumber')}</label>
                <input className="input" dir="ltr" value={form.employeeNumber} onChange={(e) => setEmp('employeeNumber', e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">{t('employees.email')}</label>
                  <input className="input" dir="ltr" type="email" value={form.email} onChange={(e) => setEmp('email', e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">{t('employees.phone')}</label>
                  <input className="input" dir="ltr" value={form.phone} onChange={(e) => setEmp('phone', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">{t('employees.gender')}</label>
                  <select className="input" value={form.gender} onChange={(e) => setEmp('gender', e.target.value)}>
                    <option value="">—</option>
                    <option value="MALE">{t('employees.male')}</option>
                    <option value="FEMALE">{t('employees.female')}</option>
                    <option value="OTHER">{t('employees.other')}</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">{t('employees.status')}</label>
                  <select className="input" value={form.employmentStatus} onChange={(e) => setEmp('employmentStatus', e.target.value)}>
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
                  <select className="input" value={form.departmentId} onChange={(e) => setEmp('departmentId', e.target.value)}>
                    <option value="">—</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">{t('employees.site')}</label>
                  <select className="input" value={form.locationId} onChange={(e) => setEmp('locationId', e.target.value)}>
                    <option value="">—</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">{t('employees.position')}</label>
                  <input className="input" value={form.designation} onChange={(e) => setEmp('designation', e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">{t('employees.hireDate')}</label>
                  <input className="input" dir="ltr" type="date" value={form.joiningDate} onChange={(e) => setEmp('joiningDate', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">{t('employees.deviceUserId')}</label>
                  <input className="input" dir="ltr" placeholder="e.g. 9003" value={form.deviceUserId} onChange={(e) => setEmp('deviceUserId', e.target.value)} />
                </div>
              </div>
              {error ? (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
              ) : null}
              <div className="flex justify-end gap-2 pt-1">
                <button className="btn-ghost" onClick={() => { setShowForm(false); setEditingId(null); }}>
                  {t('common.cancel')}
                </button>
                <button className="btn-primary" disabled={busy} onClick={() => void saveEmployee()}>
                  {busy ? t('common.loading') : editingId ? t('common.save') : t('common.save')}
                </button>
              </div>
            </div>
          </Modal>
        </div>
      ) : null}

      {/* --- Departments --- */}
      {tab === 'departments' ? (
        <div className="card space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <input
              className="input"
              placeholder={t('departments.name')}
              value={deptForm.name}
              onChange={(e) => setDept('name', e.target.value)}
            />
            <input
              className="input"
              placeholder={t('departments.code')}
              value={deptForm.code}
              onChange={(e) => setDept('code', e.target.value)}
            />
            <select
              className="input"
              value={deptForm.branchId}
              onChange={(e) => setDept('branchId', e.target.value)}
            >
              <option value="">{t('departments.branch')}</option>
            </select>
            <button
              className="btn-primary"
              disabled={deptBusy || !deptForm.name}
              onClick={() => void saveDepartment()}
            >
              {deptBusy ? t('common.loading') : editingDeptId ? t('common.save') : t('departments.add')}
            </button>
          </div>
          <table className="table-base">
            <thead>
              <tr>
                <th>{t('departments.name')}</th>
                <th>{t('departments.code')}</th>
                <th>{t('departments.branch')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {departments.map((d) => (
                <tr key={d.id}>
                  <td className="font-medium text-slate-900">{d.name}</td>
                  <td className="font-mono text-xs text-slate-500">{d.code ?? '—'}</td>
                  <td className="text-slate-500">{d.branchId ?? '—'}</td>
                  <td>
                    <div className="flex gap-2">
                      <button
                        className="btn-ghost px-3 py-1 text-xs"
                        onClick={() => openEditDepartment(d)}
                      >
                        {t('employees.edit')}
                      </button>
                      <button
                        className="btn-ghost px-3 py-1 text-xs text-red-600"
                        onClick={() => void deleteDepartment(d.id)}
                      >
                        {t('common.delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {departments.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-400">
                    {t('common.noData')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>

          <Modal open={showDeptForm} title={editingDeptId ? t('employees.edit') : t('departments.add')} onClose={() => { setShowDeptForm(false); setEditingDeptId(null); }}>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{t('departments.name')}</label>
                <input className="input" value={deptForm.name} onChange={(e) => setDept('name', e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">{t('departments.code')}</label>
                  <input className="input" value={deptForm.code} onChange={(e) => setDept('code', e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">{t('departments.branch')}</label>
                  <select className="input" value={deptForm.branchId} onChange={(e) => setDept('branchId', e.target.value)}>
                    <option value="">—</option>
                  </select>
                </div>
              </div>
              {deptError ? (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{deptError}</p>
              ) : null}
              <div className="flex justify-end gap-2 pt-1">
                <button className="btn-ghost" onClick={() => { setShowDeptForm(false); setEditingDeptId(null); }}>
                  {t('common.cancel')}
                </button>
                <button className="btn-primary" disabled={deptBusy} onClick={() => void saveDepartment()}>
                  {deptBusy ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </div>
          </Modal>
        </div>
      ) : null}
    </div>
  );
}