'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n-client';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';

interface Employee {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string | null;
  employmentStatus: string;
  department?: { name: string } | null;
  position?: string | null;
}

interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export default function EmployeesPage(): React.JSX.Element {
  const { t } = useI18n();
  const [employees, setEmployees] = useState<Employee[]>([]);

  useEffect(() => {
    api<Paged<Employee>>('/employees')
      .then((r) => setEmployees(r.items))
      .catch(() => {});
  }, []);

  return (
    <div>
      <PageHeader title={t('employees.title')} />
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>{t('employees.employeeNumber')}</th>
              <th>{t('employees.name')}</th>
              <th>{t('employees.email')}</th>
              <th>{t('employees.department')}</th>
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
                <td className="text-slate-500">{e.email ?? '—'}</td>
                <td className="text-slate-500">{e.department?.name ?? '—'}</td>
                <td>
                  <StatusBadge value={e.employmentStatus} />
                </td>
              </tr>
            ))}
            {employees.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-400">
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