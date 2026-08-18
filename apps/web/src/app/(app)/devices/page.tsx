'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n-client';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';

interface Device {
  id: string;
  deviceId: string;
  name: string;
  model: string | null;
  isActive: boolean;
  lastSeenAt: string | null;
  location?: { name: string } | null;
}

interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export default function DevicesPage(): React.JSX.Element {
  const { t } = useI18n();
  const [devices, setDevices] = useState<Device[]>([]);

  useEffect(() => {
    api<Paged<Device>>('/devices')
      .then((r) => setDevices(r.items))
      .catch(() => {});
  }, []);

  return (
    <div>
      <PageHeader title={t('devices.title')} />
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>{t('devices.deviceId')}</th>
              <th>{t('devices.name')}</th>
              <th>{t('devices.model')}</th>
              <th>{t('devices.location')}</th>
              <th>{t('devices.lastSeen')}</th>
              <th>{t('common.status')}</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d.id}>
                <td className="font-mono text-xs font-medium text-slate-900">{d.deviceId}</td>
                <td className="text-slate-900">{d.name}</td>
                <td className="text-slate-500">{d.model ?? '—'}</td>
                <td className="text-slate-500">{d.location?.name ?? '—'}</td>
                <td className="text-slate-500" dir="ltr">
                  {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : '—'}
                </td>
                <td>
                  <StatusBadge value={d.isActive ? 'ACTIVE' : 'INACTIVE'} />
                </td>
              </tr>
            ))}
            {devices.length === 0 ? (
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