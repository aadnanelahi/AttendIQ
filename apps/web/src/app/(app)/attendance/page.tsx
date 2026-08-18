'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n-client';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';

interface AttendanceDay {
  id: string;
  date: string;
  status: string;
  checkIn: string | null;
  checkOut: string | null;
  workMinutes: number;
  requiredMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  employee?: { employeeNumber: string; firstName: string; lastName: string } | null;
}

interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

const today = new Date().toISOString().slice(0, 10);

export default function AttendancePage(): React.JSX.Element {
  const { t } = useI18n();
  const [days, setDays] = useState<AttendanceDay[]>([]);

  useEffect(() => {
    api<Paged<AttendanceDay>>(`/attendance?from=${today}&to=${today}`)
      .then((r) => setDays(r.items))
      .catch(() => {});
  }, []);

  return (
    <div>
      <PageHeader title={t('attendance.title')} />
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>{t('attendance.employee')}</th>
              <th>{t('attendance.checkIn')}</th>
              <th>{t('attendance.checkOut')}</th>
              <th>{t('attendance.workMinutes')}</th>
              <th>{t('attendance.lateMinutes')}</th>
              <th>{t('attendance.overtimeMinutes')}</th>
              <th>{t('common.status')}</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.id}>
                <td className="text-slate-900">
                  {d.employee ? `${d.employee.employeeNumber} · ${d.employee.firstName} ${d.employee.lastName}` : '—'}
                </td>
                <td dir="ltr">{d.checkIn ? new Date(d.checkIn).toLocaleTimeString() : '—'}</td>
                <td dir="ltr">{d.checkOut ? new Date(d.checkOut).toLocaleTimeString() : '—'}</td>
                <td className="text-slate-500">{d.workMinutes}</td>
                <td className="text-slate-500">{d.lateMinutes}</td>
                <td className="text-slate-500">{d.overtimeMinutes}</td>
                <td>
                  <StatusBadge value={d.status} />
                </td>
              </tr>
            ))}
            {days.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-slate-400">
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