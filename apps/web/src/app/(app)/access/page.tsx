'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n-client';
import { PageHeader } from '@/components/PageHeader';

type SubTab = 'devices' | 'doors' | 'groups';

interface AccessDevice {
  id: string;
  name: string;
  type: string;
  deviceId: string | null;
}

interface Door {
  id: string;
  name: string;
  code: string | null;
  branch?: { name: string } | null;
}

interface AccessGroup {
  id: string;
  name: string;
  doors: { door: { id: string; name: string } }[];
  assignments: { employee: { id: string; firstName: string; lastName: string; employeeNumber: string } }[];
}

interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export default function AccessPage(): React.JSX.Element {
  const { t } = useI18n();
  const [tab, setTab] = useState<SubTab>('devices');

  const [accessDevices, setAccessDevices] = useState<AccessDevice[]>([]);
  const [doors, setDoors] = useState<Door[]>([]);
  const [groups, setGroups] = useState<AccessGroup[]>([]);

  // Add forms
  const [devForm, setDevForm] = useState({ name: '', type: 'READER', deviceId: '' });
  const [doorForm, setDoorForm] = useState({ name: '', code: '' });
  const [groupForm, setGroupForm] = useState({ name: '', doorIds: [] as string[] });
  const [busy, setBusy] = useState(false);

  const loadAll = useCallback(() => {
    api<AccessDevice[]>('/access/devices')
      .then(setAccessDevices)
      .catch(() => {});
    api<Paged<Door>>('/access/doors')
      .then((r) => setDoors(r.items))
      .catch(() => {});
    api<AccessGroup[]>('/access/groups')
      .then(setGroups)
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function addDevice(): Promise<void> {
    setBusy(true);
    try {
      await api<AccessDevice>('/access/devices', {
        method: 'POST',
        body: { name: devForm.name, type: devForm.type, deviceId: devForm.deviceId || undefined },
      });
      setDevForm({ name: '', type: 'READER', deviceId: '' });
      loadAll();
    } catch {
      // no-op
    } finally {
      setBusy(false);
    }
  }

  async function addDoor(): Promise<void> {
    setBusy(true);
    try {
      await api<Door>('/access/doors', { method: 'POST', body: { name: doorForm.name, code: doorForm.code || undefined } });
      setDoorForm({ name: '', code: '' });
      loadAll();
    } catch {
      // no-op
    } finally {
      setBusy(false);
    }
  }

  async function addGroup(): Promise<void> {
    setBusy(true);
    try {
      await api<AccessGroup>('/access/groups', { method: 'POST', body: { name: groupForm.name, doorIds: groupForm.doorIds } });
      setGroupForm({ name: '', doorIds: [] });
      loadAll();
    } catch {
      // no-op
    } finally {
      setBusy(false);
    }
  }

  async function removeDoor(id: string): Promise<void> {
    if (!window.confirm('Delete this door?')) return;
    await api(`/access/doors/${id}`, { method: 'DELETE' })
      .then(loadAll)
      .catch(() => {});
  }

  async function removeGroup(id: string): Promise<void> {
    if (!window.confirm('Delete this group?')) return;
    await api(`/access/groups/${id}`, { method: 'DELETE' })
      .then(loadAll)
      .catch(() => {});
  }

  function toggleDoorInGroup(id: string): void {
    setGroupForm((f) => ({
      ...f,
      doorIds: f.doorIds.includes(id) ? f.doorIds.filter((d) => d !== id) : [...f.doorIds, id],
    }));
  }

  const tabs: { key: SubTab; label: string }[] = [
    { key: 'devices', label: t('access.devices') },
    { key: 'doors', label: t('access.doors') },
    { key: 'groups', label: t('access.groups') },
  ];

  return (
    <div>
      <PageHeader title={t('access.title')} />
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

      {/* --- Access devices --- */}
      {tab === 'devices' ? (
        <div className="card space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <input className="input" placeholder={t('access.deviceName')} value={devForm.name} onChange={(e) => setDevForm({ ...devForm, name: e.target.value })} />
            <select className="input" value={devForm.type} onChange={(e) => setDevForm({ ...devForm, type: e.target.value })}>
              <option value="READER">READER</option>
              <option value="PERSONNEL">PERSONNEL</option>
              <option value="GATE">GATE</option>
              <option value="TURNTILE">TURNTILE</option>
              <option value="ELEVATOR">ELEVATOR</option>
            </select>
            <input className="input" dir="ltr" placeholder="Device ID" value={devForm.deviceId} onChange={(e) => setDevForm({ ...devForm, deviceId: e.target.value })} />
            <button className="btn-primary" disabled={busy || !devForm.name} onClick={() => void addDevice()}>
              + {t('access.add')}
            </button>
          </div>
          <table className="table-base">
            <thead>
              <tr>
                <th>{t('access.deviceName')}</th>
                <th>{t('access.deviceType')}</th>
                <th>Device ID</th>
              </tr>
            </thead>
            <tbody>
              {accessDevices.map((d) => (
                <tr key={d.id}>
                  <td className="font-medium text-slate-900">{d.name}</td>
                  <td className="text-slate-500">{d.type}</td>
                  <td className="font-mono text-xs text-slate-500">{d.deviceId ?? '—'}</td>
                </tr>
              ))}
              {accessDevices.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-slate-400">
                    {t('common.noData')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* --- Doors --- */}
      {tab === 'doors' ? (
        <div className="card space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <input className="input" placeholder={t('access.doorName')} value={doorForm.name} onChange={(e) => setDoorForm({ ...doorForm, name: e.target.value })} />
            <input className="input" dir="ltr" placeholder={t('access.doorCode')} value={doorForm.code} onChange={(e) => setDoorForm({ ...doorForm, code: e.target.value })} />
            <button className="btn-primary" disabled={busy || !doorForm.name} onClick={() => void addDoor()}>
              + {t('access.add')}
            </button>
          </div>
          <table className="table-base">
            <thead>
              <tr>
                <th>{t('access.doorName')}</th>
                <th>{t('access.doorCode')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {doors.map((d) => (
                <tr key={d.id}>
                  <td className="font-medium text-slate-900">{d.name}</td>
                  <td className="font-mono text-xs text-slate-500">{d.code ?? '—'}</td>
                  <td>
                    <button className="btn-ghost px-3 py-1 text-xs text-red-600" onClick={() => void removeDoor(d.id)}>
                      {t('common.delete')}
                    </button>
                  </td>
                </tr>
              ))}
              {doors.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-slate-400">
                    {t('common.noData')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* --- Groups --- */}
      {tab === 'groups' ? (
        <div className="card space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
            <input className="input" placeholder={t('access.groupName')} value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} />
            <button className="btn-primary" disabled={busy || !groupForm.name} onClick={() => void addGroup()}>
              + {t('access.add')}
            </button>
          </div>
          {doors.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {doors.map((d) => (
                <button
                  key={d.id}
                  onClick={() => toggleDoorInGroup(d.id)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    groupForm.doorIds.includes(d.id)
                      ? 'border-brand-600 bg-brand-50 text-brand-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {d.name}
                </button>
              ))}
            </div>
          ) : null}
          <table className="table-base">
            <thead>
              <tr>
                <th>{t('access.groupName')}</th>
                <th>{t('access.doors')}</th>
                <th>{t('access.assignments')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id}>
                  <td className="font-medium text-slate-900">{g.name}</td>
                  <td className="text-slate-500">{g.doors.map((x) => x.door.name).join(', ') || '—'}</td>
                  <td className="text-slate-500">{g.assignments.map((a) => a.employee.firstName).join(', ') || '—'}</td>
                  <td>
                    <button className="btn-ghost px-3 py-1 text-xs text-red-600" onClick={() => void removeGroup(g.id)}>
                      {t('common.delete')}
                    </button>
                  </td>
                </tr>
              ))}
              {groups.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-400">
                    {t('common.noData')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}