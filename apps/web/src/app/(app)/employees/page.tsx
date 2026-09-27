'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n-client';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Modal } from '@/components/Modal';

type SubTab = 'employees' | 'departments' | 'branches' | 'locations';

interface Named {
  id: string;
  name: string;
}

interface Employee {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone?: string | null;
  gender?: string | null;
  employmentStatus: string;
  designation?: string | null;
  joiningDate?: string | null;
  deviceUserId?: string | null;
  department?: Named | null;
  branch?: Named | null;
  location?: Named | null;
}

interface Department {
  id: string;
  name: string;
  code: string | null;
  branchId?: string | null;
  branch?: Named | null;
}

interface Branch {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  timezone: string;
}

interface Location {
  id: string;
  name: string;
  branchId?: string | null;
  branch?: Named | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  radiusMeters?: number | null;
}

interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// Large enough to fill the dropdowns in one request (API maximum is 200).
const LIST_QUERY = '?pageSize=200';

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
  branchId: '',
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

const EMPTY_BRANCH_FORM = {
  id: '',
  name: '',
  code: '',
  address: '',
  timezone: 'Asia/Dubai',
};

const EMPTY_LOCATION_FORM = {
  id: '',
  name: '',
  branchId: '',
  address: '',
  latitude: '',
  longitude: '',
  radiusMeters: '',
};

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.fieldErrors) {
    const first = Object.values(err.fieldErrors)[0];
    if (first) return String(first);
  }
  return err instanceof Error ? err.message : fallback;
}

/** Items that belong to the chosen branch, plus items not tied to any branch. */
function forBranch<T extends { branchId?: string | null }>(items: T[], branchId: string): T[] {
  if (!branchId) return items;
  return items.filter((i) => !i.branchId || i.branchId === branchId);
}

function optionalNumber(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export default function EmployeesPage(): React.JSX.Element {
  const { t } = useI18n();
  const [tab, setTab] = useState<SubTab>('employees');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [pageError, setPageError] = useState<string | null>(null);

  const [form, setForm] = useState({ ...EMPTY_EMPLOYEE_FORM });
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [deptForm, setDeptForm] = useState({ ...EMPTY_DEPARTMENT_FORM });
  const [showDeptForm, setShowDeptForm] = useState(false);
  const [deptBusy, setDeptBusy] = useState(false);
  const [deptError, setDeptError] = useState<string | null>(null);
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);

  const [branchForm, setBranchForm] = useState({ ...EMPTY_BRANCH_FORM });
  const [showBranchForm, setShowBranchForm] = useState(false);
  const [branchBusy, setBranchBusy] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);

  const [locForm, setLocForm] = useState({ ...EMPTY_LOCATION_FORM });
  const [showLocForm, setShowLocForm] = useState(false);
  const [locBusy, setLocBusy] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  const branchName = useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches]);

  const loadEmployees = useCallback(() => {
    api<Paged<Employee>>(`/employees${LIST_QUERY}`)
      .then((r) => setEmployees(r.items))
      .catch((err) => setPageError(errorMessage(err, t('common.error'))));
  }, [t]);

  const loadDepartments = useCallback(() => {
    api<Paged<Department>>(`/departments${LIST_QUERY}`)
      .then((r) => setDepartments(r.items))
      .catch((err) => setPageError(errorMessage(err, t('common.error'))));
  }, [t]);

  const loadBranches = useCallback(() => {
    api<Paged<Branch>>(`/branches${LIST_QUERY}`)
      .then((r) => setBranches(r.items))
      .catch((err) => setPageError(errorMessage(err, t('common.error'))));
  }, [t]);

  const loadLocations = useCallback(() => {
    api<Paged<Location>>(`/locations${LIST_QUERY}`)
      .then((r) => setLocations(r.items))
      .catch((err) => setPageError(errorMessage(err, t('common.error'))));
  }, [t]);

  const loadAll = useCallback(() => {
    loadEmployees();
    loadDepartments();
    loadBranches();
    loadLocations();
  }, [loadEmployees, loadDepartments, loadBranches, loadLocations]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ---------- Employees ----------

  function setEmp<K extends keyof typeof EMPTY_EMPLOYEE_FORM>(key: K, value: string): void {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function changeEmployeeBranch(branchId: string): void {
    setForm((f) => {
      const dept = departments.find((d) => d.id === f.departmentId);
      const loc = locations.find((l) => l.id === f.locationId);
      return {
        ...f,
        branchId,
        // Clear a department/location that belongs to a different branch.
        departmentId: branchId && dept?.branchId && dept.branchId !== branchId ? '' : f.departmentId,
        locationId: branchId && loc?.branchId && loc.branchId !== branchId ? '' : f.locationId,
      };
    });
  }

  function openAddEmployee(): void {
    setEditingId(null);
    setError(null);
    setForm({ ...EMPTY_EMPLOYEE_FORM });
    setShowForm(true);
  }

  function openEditEmployee(e: Employee): void {
    setEditingId(e.id);
    setError(null);
    setForm({
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      employeeNumber: e.employeeNumber,
      email: e.email ?? '',
      phone: e.phone ?? '',
      gender: e.gender ?? '',
      employmentStatus: e.employmentStatus,
      designation: e.designation ?? '',
      branchId: e.branch?.id ?? '',
      departmentId: e.department?.id ?? '',
      locationId: e.location?.id ?? '',
      joiningDate: e.joiningDate ? e.joiningDate.slice(0, 10) : '',
      deviceUserId: e.deviceUserId ?? '',
    });
    setShowForm(true);
  }

  async function saveEmployee(): Promise<void> {
    setBusy(true);
    setError(null);
    // When editing, an emptied link is sent as null so it is actually cleared.
    const link = (value: string): string | null | undefined => (value ? value : editingId ? null : undefined);
    const body: Record<string, unknown> = {
      firstName: form.firstName,
      lastName: form.lastName,
      employeeNumber: form.employeeNumber,
      email: form.email || undefined,
      phone: form.phone || undefined,
      gender: form.gender || undefined,
      employmentStatus: form.employmentStatus,
      designation: form.designation || undefined,
      branchId: link(form.branchId),
      departmentId: link(form.departmentId),
      locationId: link(form.locationId),
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
      setError(errorMessage(err, t('common.error')));
    } finally {
      setBusy(false);
    }
  }

  async function deleteEmployee(id: string): Promise<void> {
    if (!window.confirm(t('employees.confirmDelete'))) return;
    await api(`/employees/${id}`, { method: 'DELETE' })
      .then(() => loadEmployees())
      .catch((err) => setPageError(errorMessage(err, t('common.error'))));
  }

  // ---------- Departments ----------

  function setDept<K extends keyof typeof EMPTY_DEPARTMENT_FORM>(key: K, value: string): void {
    setDeptForm((f) => ({ ...f, [key]: value }));
  }

  function openAddDepartment(): void {
    setEditingDeptId(null);
    setDeptError(null);
    setDeptForm({ ...EMPTY_DEPARTMENT_FORM });
    setShowDeptForm(true);
  }

  function openEditDepartment(d: Department): void {
    setEditingDeptId(d.id);
    setDeptError(null);
    setDeptForm({
      id: d.id,
      name: d.name,
      code: d.code ?? '',
      branchId: d.branchId ?? '',
    });
    setShowDeptForm(true);
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
      setDeptError(errorMessage(err, t('common.error')));
    } finally {
      setDeptBusy(false);
    }
  }

  async function deleteDepartment(id: string): Promise<void> {
    if (!window.confirm(t('departments.confirmDelete'))) return;
    await api(`/departments/${id}`, { method: 'DELETE' })
      .then(() => {
        loadDepartments();
        loadEmployees();
      })
      .catch((err) => setPageError(errorMessage(err, t('common.error'))));
  }

  // ---------- Branches ----------

  function setBr<K extends keyof typeof EMPTY_BRANCH_FORM>(key: K, value: string): void {
    setBranchForm((f) => ({ ...f, [key]: value }));
  }

  function openAddBranch(): void {
    setBranchError(null);
    setBranchForm({ ...EMPTY_BRANCH_FORM });
    setShowBranchForm(true);
  }

  function openEditBranch(b: Branch): void {
    setBranchError(null);
    setBranchForm({
      id: b.id,
      name: b.name,
      code: b.code ?? '',
      address: b.address ?? '',
      timezone: b.timezone || 'UTC',
    });
    setShowBranchForm(true);
  }

  async function saveBranch(): Promise<void> {
    setBranchBusy(true);
    setBranchError(null);
    const body: Record<string, unknown> = {
      name: branchForm.name,
      code: branchForm.code || undefined,
      address: branchForm.address || undefined,
      timezone: branchForm.timezone || 'UTC',
    };
    try {
      if (branchForm.id) {
        await api<Branch>(`/branches/${branchForm.id}`, { method: 'PUT', body });
      } else {
        await api<Branch>('/branches', { method: 'POST', body });
      }
      setShowBranchForm(false);
      setBranchForm({ ...EMPTY_BRANCH_FORM });
      loadBranches();
    } catch (err) {
      setBranchError(errorMessage(err, t('common.error')));
    } finally {
      setBranchBusy(false);
    }
  }

  async function deleteBranch(id: string): Promise<void> {
    if (!window.confirm(t('branches.confirmDelete'))) return;
    await api(`/branches/${id}`, { method: 'DELETE' })
      .then(() => loadAll())
      .catch((err) => setPageError(errorMessage(err, t('common.error'))));
  }

  // ---------- Locations ----------

  function setLoc<K extends keyof typeof EMPTY_LOCATION_FORM>(key: K, value: string): void {
    setLocForm((f) => ({ ...f, [key]: value }));
  }

  function openAddLocation(): void {
    setLocError(null);
    setLocForm({ ...EMPTY_LOCATION_FORM });
    setShowLocForm(true);
  }

  function openEditLocation(l: Location): void {
    setLocError(null);
    setLocForm({
      id: l.id,
      name: l.name,
      branchId: l.branchId ?? '',
      address: l.address ?? '',
      latitude: l.latitude != null ? String(l.latitude) : '',
      longitude: l.longitude != null ? String(l.longitude) : '',
      radiusMeters: l.radiusMeters != null ? String(l.radiusMeters) : '',
    });
    setShowLocForm(true);
  }

  async function saveLocation(): Promise<void> {
    setLocBusy(true);
    setLocError(null);
    const body: Record<string, unknown> = {
      name: locForm.name,
      branchId: locForm.branchId || undefined,
      address: locForm.address || undefined,
      latitude: optionalNumber(locForm.latitude),
      longitude: optionalNumber(locForm.longitude),
      radiusMeters: optionalNumber(locForm.radiusMeters),
    };
    try {
      if (locForm.id) {
        await api<Location>(`/locations/${locForm.id}`, { method: 'PUT', body });
      } else {
        await api<Location>('/locations', { method: 'POST', body });
      }
      setShowLocForm(false);
      setLocForm({ ...EMPTY_LOCATION_FORM });
      loadLocations();
    } catch (err) {
      setLocError(errorMessage(err, t('common.error')));
    } finally {
      setLocBusy(false);
    }
  }

  async function deleteLocation(id: string): Promise<void> {
    if (!window.confirm(t('locations.confirmDelete'))) return;
    await api(`/locations/${id}`, { method: 'DELETE' })
      .then(() => {
        loadLocations();
        loadEmployees();
      })
      .catch((err) => setPageError(errorMessage(err, t('common.error'))));
  }

  // ---------- Render ----------

  const tabs: { key: SubTab; label: string }[] = [
    { key: 'employees', label: t('employees.title') },
    { key: 'departments', label: t('departments.title') },
    { key: 'branches', label: t('branches.title') },
    { key: 'locations', label: t('locations.title') },
  ];

  const headerAction: Record<SubTab, { label: string; onClick: () => void }> = {
    employees: { label: t('employees.add'), onClick: openAddEmployee },
    departments: { label: t('departments.add'), onClick: openAddDepartment },
    branches: { label: t('branches.add'), onClick: openAddBranch },
    locations: { label: t('locations.add'), onClick: openAddLocation },
  };

  const label = 'mb-1 block text-sm font-medium text-slate-700';
  const rowActions = (onEdit: () => void, onDelete: () => void): React.JSX.Element => (
    <div className="flex gap-2">
      <button className="btn-ghost px-3 py-1 text-xs" onClick={onEdit}>
        {t('employees.edit')}
      </button>
      <button className="btn-ghost px-3 py-1 text-xs text-red-600" onClick={onDelete}>
        {t('common.delete')}
      </button>
    </div>
  );
  const emptyRow = (cols: number): React.JSX.Element => (
    <tr>
      <td colSpan={cols} className="py-6 text-center text-slate-400">
        {t('common.noData')}
      </td>
    </tr>
  );
  const branchOptions = (
    <>
      <option value="">—</option>
      {branches.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </>
  );

  return (
    <div>
      <PageHeader
        title={tabs.find((x) => x.key === tab)?.label ?? t('employees.title')}
        action={
          <button className="btn-primary" onClick={headerAction[tab].onClick}>
            + {headerAction[tab].label}
          </button>
        }
      ></PageHeader>
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map((x) => (
          <button
            key={x.key}
            onClick={() => setTab(x.key)}
            className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === x.key
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {x.label}
          </button>
        ))}
      </div>

      {pageError ? (
        <p className="mb-4 flex items-start justify-between gap-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{pageError}</span>
          <button className="text-red-500" onClick={() => setPageError(null)} aria-label="Dismiss">
            ×
          </button>
        </p>
      ) : null}

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
                  <th>{t('employees.branch')}</th>
                  <th>{t('employees.department')}</th>
                  <th>{t('employees.location')}</th>
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
                    <td className="text-slate-500">{e.branch?.name ?? '—'}</td>
                    <td className="text-slate-500">{e.department?.name ?? '—'}</td>
                    <td className="text-slate-500">{e.location?.name ?? '—'}</td>
                    <td className="text-slate-500">{e.designation ?? '—'}</td>
                    <td>
                      <StatusBadge value={e.employmentStatus} />
                    </td>
                    <td>{rowActions(() => openEditEmployee(e), () => void deleteEmployee(e.id))}</td>
                  </tr>
                ))}
                {employees.length === 0 ? emptyRow(9) : null}
              </tbody>
            </table>
          </div>

          <Modal open={showForm} title={editingId ? t('employees.edit') : t('employees.add')} onClose={() => { setShowForm(false); setEditingId(null); }}>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>{t('employees.firstName')}</label>
                  <input className="input" value={form.firstName} onChange={(e) => setEmp('firstName', e.target.value)} required />
                </div>
                <div>
                  <label className={label}>{t('employees.lastName')}</label>
                  <input className="input" value={form.lastName} onChange={(e) => setEmp('lastName', e.target.value)} required />
                </div>
              </div>
              <div>
                <label className={label}>{t('employees.employeeNumber')}</label>
                <input className="input" dir="ltr" value={form.employeeNumber} onChange={(e) => setEmp('employeeNumber', e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>{t('employees.email')}</label>
                  <input className="input" dir="ltr" type="email" value={form.email} onChange={(e) => setEmp('email', e.target.value)} />
                </div>
                <div>
                  <label className={label}>{t('employees.phone')}</label>
                  <input className="input" dir="ltr" value={form.phone} onChange={(e) => setEmp('phone', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>{t('employees.gender')}</label>
                  <select className="input" value={form.gender} onChange={(e) => setEmp('gender', e.target.value)}>
                    <option value="">—</option>
                    <option value="MALE">{t('employees.male')}</option>
                    <option value="FEMALE">{t('employees.female')}</option>
                    <option value="OTHER">{t('employees.other')}</option>
                  </select>
                </div>
                <div>
                  <label className={label}>{t('employees.status')}</label>
                  <select className="input" value={form.employmentStatus} onChange={(e) => setEmp('employmentStatus', e.target.value)}>
                    <option value="ACTIVE">{t('status.ACTIVE')}</option>
                    <option value="ON_LEAVE">{t('status.ON_LEAVE')}</option>
                    <option value="SUSPENDED">{t('status.SUSPENDED')}</option>
                    <option value="TERMINATED">{t('status.TERMINATED')}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={label}>{t('employees.branch')}</label>
                <select className="input" value={form.branchId} onChange={(e) => changeEmployeeBranch(e.target.value)}>
                  {branchOptions}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>{t('employees.department')}</label>
                  <select className="input" value={form.departmentId} onChange={(e) => setEmp('departmentId', e.target.value)}>
                    <option value="">—</option>
                    {forBranch(departments, form.branchId).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={label}>{t('employees.location')}</label>
                  <select className="input" value={form.locationId} onChange={(e) => setEmp('locationId', e.target.value)}>
                    <option value="">—</option>
                    {forBranch(locations, form.branchId).map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>{t('employees.position')}</label>
                  <input className="input" value={form.designation} onChange={(e) => setEmp('designation', e.target.value)} />
                </div>
                <div>
                  <label className={label}>{t('employees.hireDate')}</label>
                  <input className="input" dir="ltr" type="date" value={form.joiningDate} onChange={(e) => setEmp('joiningDate', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>{t('employees.deviceUserId')}</label>
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
                  {busy ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </div>
          </Modal>
        </div>
      ) : null}

      {/* --- Departments --- */}
      {tab === 'departments' ? (
        <div className="card space-y-4">
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
                  <td className="text-slate-500">{d.branch?.name ?? (d.branchId ? branchName.get(d.branchId) : null) ?? '—'}</td>
                  <td>{rowActions(() => openEditDepartment(d), () => void deleteDepartment(d.id))}</td>
                </tr>
              ))}
              {departments.length === 0 ? emptyRow(4) : null}
            </tbody>
          </table>

          <Modal open={showDeptForm} title={editingDeptId ? t('employees.edit') : t('departments.add')} onClose={() => { setShowDeptForm(false); setEditingDeptId(null); }}>
            <div className="space-y-3">
              <div>
                <label className={label}>{t('departments.name')}</label>
                <input className="input" value={deptForm.name} onChange={(e) => setDept('name', e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>{t('departments.code')}</label>
                  <input className="input" value={deptForm.code} onChange={(e) => setDept('code', e.target.value)} />
                </div>
                <div>
                  <label className={label}>{t('departments.branch')}</label>
                  <select className="input" value={deptForm.branchId} onChange={(e) => setDept('branchId', e.target.value)}>
                    {branchOptions}
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
                <button className="btn-primary" disabled={deptBusy || !deptForm.name} onClick={() => void saveDepartment()}>
                  {deptBusy ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </div>
          </Modal>
        </div>
      ) : null}

      {/* --- Branches --- */}
      {tab === 'branches' ? (
        <div className="card space-y-4">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>{t('branches.name')}</th>
                  <th>{t('branches.code')}</th>
                  <th>{t('branches.address')}</th>
                  <th>{t('branches.timezone')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {branches.map((b) => (
                  <tr key={b.id}>
                    <td className="font-medium text-slate-900">{b.name}</td>
                    <td className="font-mono text-xs text-slate-500">{b.code ?? '—'}</td>
                    <td className="text-slate-500">{b.address ?? '—'}</td>
                    <td className="text-slate-500" dir="ltr">{b.timezone}</td>
                    <td>{rowActions(() => openEditBranch(b), () => void deleteBranch(b.id))}</td>
                  </tr>
                ))}
                {branches.length === 0 ? emptyRow(5) : null}
              </tbody>
            </table>
          </div>

          <Modal open={showBranchForm} title={branchForm.id ? t('branches.edit') : t('branches.add')} onClose={() => setShowBranchForm(false)}>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>{t('branches.name')}</label>
                  <input className="input" value={branchForm.name} onChange={(e) => setBr('name', e.target.value)} required />
                </div>
                <div>
                  <label className={label}>{t('branches.code')}</label>
                  <input className="input" value={branchForm.code} onChange={(e) => setBr('code', e.target.value)} />
                </div>
              </div>
              <div>
                <label className={label}>{t('branches.address')}</label>
                <input className="input" value={branchForm.address} onChange={(e) => setBr('address', e.target.value)} />
              </div>
              <div>
                <label className={label}>{t('branches.timezone')}</label>
                <input className="input" dir="ltr" placeholder="Asia/Dubai" value={branchForm.timezone} onChange={(e) => setBr('timezone', e.target.value)} />
              </div>
              {branchError ? (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{branchError}</p>
              ) : null}
              <div className="flex justify-end gap-2 pt-1">
                <button className="btn-ghost" onClick={() => setShowBranchForm(false)}>
                  {t('common.cancel')}
                </button>
                <button className="btn-primary" disabled={branchBusy || !branchForm.name} onClick={() => void saveBranch()}>
                  {branchBusy ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </div>
          </Modal>
        </div>
      ) : null}

      {/* --- Locations --- */}
      {tab === 'locations' ? (
        <div className="card space-y-4">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>{t('locations.name')}</th>
                  <th>{t('locations.branch')}</th>
                  <th>{t('locations.address')}</th>
                  <th>GPS</th>
                  <th>{t('locations.radius')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {locations.map((l) => (
                  <tr key={l.id}>
                    <td className="font-medium text-slate-900">{l.name}</td>
                    <td className="text-slate-500">{l.branch?.name ?? (l.branchId ? branchName.get(l.branchId) : null) ?? '—'}</td>
                    <td className="text-slate-500">{l.address ?? '—'}</td>
                    <td className="font-mono text-xs text-slate-500" dir="ltr">
                      {l.latitude != null && l.longitude != null ? `${l.latitude}, ${l.longitude}` : '—'}
                    </td>
                    <td className="text-slate-500">{l.radiusMeters ?? '—'}</td>
                    <td>{rowActions(() => openEditLocation(l), () => void deleteLocation(l.id))}</td>
                  </tr>
                ))}
                {locations.length === 0 ? emptyRow(6) : null}
              </tbody>
            </table>
          </div>

          <Modal open={showLocForm} title={locForm.id ? t('locations.edit') : t('locations.add')} onClose={() => setShowLocForm(false)}>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>{t('locations.name')}</label>
                  <input className="input" value={locForm.name} onChange={(e) => setLoc('name', e.target.value)} required />
                </div>
                <div>
                  <label className={label}>{t('locations.branch')}</label>
                  <select className="input" value={locForm.branchId} onChange={(e) => setLoc('branchId', e.target.value)}>
                    {branchOptions}
                  </select>
                </div>
              </div>
              <div>
                <label className={label}>{t('locations.address')}</label>
                <input className="input" value={locForm.address} onChange={(e) => setLoc('address', e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={label}>{t('locations.latitude')}</label>
                  <input className="input" dir="ltr" inputMode="decimal" placeholder="25.3463" value={locForm.latitude} onChange={(e) => setLoc('latitude', e.target.value)} />
                </div>
                <div>
                  <label className={label}>{t('locations.longitude')}</label>
                  <input className="input" dir="ltr" inputMode="decimal" placeholder="55.4209" value={locForm.longitude} onChange={(e) => setLoc('longitude', e.target.value)} />
                </div>
                <div>
                  <label className={label}>{t('locations.radius')}</label>
                  <input className="input" dir="ltr" inputMode="numeric" placeholder="100" value={locForm.radiusMeters} onChange={(e) => setLoc('radiusMeters', e.target.value)} />
                </div>
              </div>
              <p className="text-xs text-slate-500">{t('locations.gpsHint')}</p>
              {locError ? (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{locError}</p>
              ) : null}
              <div className="flex justify-end gap-2 pt-1">
                <button className="btn-ghost" onClick={() => setShowLocForm(false)}>
                  {t('common.cancel')}
                </button>
                <button className="btn-primary" disabled={locBusy || !locForm.name} onClick={() => void saveLocation()}>
                  {locBusy ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </div>
          </Modal>
        </div>
      ) : null}
    </div>
  );
}
