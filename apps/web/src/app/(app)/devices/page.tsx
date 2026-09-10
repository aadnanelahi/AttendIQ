'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, apiEnvelope, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n-client';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Modal } from '@/components/Modal';

interface Device {
  id: string;
  deviceId: string;
  vendor: string;
  model: string;
  serialNumber: string | null;
  ipAddress: string | null;
  protocol: string;
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

interface DeviceTestResult {
  reachable: boolean;
  protocol: string;
  target?: string;
  latencyMs?: number;
  message: string;
}

const EMPTY_FORM = {
  vendor: 'ZKTeco',
  model: '',
  deviceId: '',
  serialNumber: '',
  ipAddress: '',
  port: '',
  protocol: 'zktcp',
};

export default function DevicesPage(): React.JSX.Element {
  const { t } = useI18n();
  const [devices, setDevices] = useState<Device[]>([]);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [rotateDeviceId, setRotateDeviceId] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testDeviceId, setTestDeviceId] = useState('');
  const [testResult, setTestResult] = useState<DeviceTestResult | null>(null);
  const [testing, setTesting] = useState(false);

  const load = useCallback(() => {
    api<Paged<Device>>('/devices')
      .then((r) => setDevices(r.items))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function set<K extends keyof typeof EMPTY_FORM>(key: K, value: string): void {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function addDevice(): Promise<void> {
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = {
      vendor: form.vendor,
      model: form.model,
      deviceId: form.deviceId,
      serialNumber: form.serialNumber || undefined,
      ipAddress: form.ipAddress || undefined,
      port: form.port ? Number(form.port) : undefined,
      protocol: form.protocol,
    };
    try {
      const res = await apiEnvelope<Device>('/devices', { method: 'POST', body });
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
      setNewToken((res.deviceToken as string | undefined) ?? null);
      setDevices((prev) => [res.data, ...prev]);
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

  async function rotateToken(id: string): Promise<void> {
    setRotating(true);
    setError(null);
    try {
      const res = await apiEnvelope<{ deviceId: string }>(`/devices/${id}/rotate-token`, { method: 'POST', body: {} });
      setRotateDeviceId(null);
      setNewToken((res.deviceToken as string | undefined) ?? null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setRotating(false);
    }
  }

  async function testCommunication(): Promise<void> {
    if (!testDeviceId) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api<DeviceTestResult>(`/devices/${testDeviceId}/test-communication`, { method: 'POST', body: {} });
      setTestResult(res);
      if (res.reachable) load();
    } catch (err) {
      setTestResult({
        reachable: false,
        protocol: '',
        message: err instanceof Error ? err.message : t('common.error'),
      });
    } finally {
      setTesting(false);
    }
  }

  async function removeDevice(id: string): Promise<void> {
    if (!window.confirm('Delete this device?')) return;
    await api(`/devices/${id}`, { method: 'DELETE' })
      .then(() => load())
      .catch(() => {});
  }

  return (
    <div>
      <PageHeader
        title={t('devices.title')}
        action={
          <div className="flex items-center gap-2">
            <button className="btn-ghost" onClick={() => setTestOpen(true)}>
              {t('devices.test')}
            </button>
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              + {t('devices.add')}
            </button>
          </div>
        }
      />
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>{t('devices.deviceId')}</th>
              <th>{t('devices.vendor')}</th>
              <th>{t('devices.model')}</th>
              <th>{t('devices.ip')}</th>
              <th>{t('devices.protocol')}</th>
              <th>{t('devices.lastSeen')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d.id}>
                <td className="font-mono text-xs font-medium text-slate-900">{d.deviceId}</td>
                <td className="text-slate-900">{d.vendor}</td>
                <td className="text-slate-500">{d.model}</td>
                <td className="text-slate-500" dir="ltr">{d.ipAddress ?? '—'}</td>
                <td className="text-slate-500">{d.protocol}</td>
                <td className="text-slate-500" dir="ltr">
                  {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : '—'}
                </td>
                <td>
                  <StatusBadge value={d.isActive ? 'ACTIVE' : 'INACTIVE'} />
                </td>
                <td>
                  <div className="flex gap-2">
                    <button className="btn-ghost px-3 py-1 text-xs" onClick={() => setRotateDeviceId(d.id)}>
                      {t('devices.rotate')}
                    </button>
                    <button className="btn-ghost px-3 py-1 text-xs text-red-600" onClick={() => void removeDevice(d.id)}>
                      {t('common.delete')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {devices.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-6 text-center text-slate-400">
                  {t('common.noData')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Add device */}
      <Modal open={showForm} title={t('devices.add')} onClose={() => setShowForm(false)}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('devices.vendor')}</label>
              <input className="input" value={form.vendor} onChange={(e) => set('vendor', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('devices.model')}</label>
              <input className="input" value={form.model} onChange={(e) => set('model', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t('devices.deviceId')}</label>
            <input className="input" dir="ltr" value={form.deviceId} onChange={(e) => set('deviceId', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('devices.serialNumber')}</label>
              <input className="input" dir="ltr" value={form.serialNumber} onChange={(e) => set('serialNumber', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('devices.port')}</label>
              <input className="input" dir="ltr" type="number" value={form.port} onChange={(e) => set('port', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('devices.ip')}</label>
              <input className="input" dir="ltr" value={form.ipAddress} onChange={(e) => set('ipAddress', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('devices.protocol')}</label>
              <select className="input" value={form.protocol} onChange={(e) => set('protocol', e.target.value)}>
                <option value="zktcp">zktcp</option>
                <option value="http-push">http-push</option>
                <option value="zkcloud">zkcloud</option>
                <option value="mqtt">mqtt</option>
              </select>
            </div>
          </div>
          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <button className="btn-ghost" onClick={() => setShowForm(false)}>
              {t('common.cancel')}
            </button>
            <button className="btn-primary" disabled={busy} onClick={() => void addDevice()}>
              {busy ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirm rotation */}
      <Modal open={rotateDeviceId !== null} title={t('devices.rotate')} onClose={() => setRotateDeviceId(null)}>
        <p className="text-sm text-slate-600">
          {t('devices.rotateConfirm')} {t('devices.tokenOnce')}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setRotateDeviceId(null)}>
            {t('common.cancel')}
          </button>
          <button
            className="btn-primary"
            disabled={rotating}
            onClick={() => rotateDeviceId && void rotateToken(rotateDeviceId)}
          >
            {rotating ? t('common.loading') : t('devices.rotate')}
          </button>
        </div>
      </Modal>

      {/* Token display */}
      <Modal open={newToken !== null} title={t('devices.tokenTitle')} onClose={() => setNewToken(null)}>
        <p className="mb-2 text-sm text-slate-600">{t('devices.tokenOnce')}</p>
        <div className="rounded-lg bg-slate-900 p-3">
          <code className="block break-all font-mono text-xs text-emerald-300" dir="ltr">
            {newToken}
          </code>
        </div>
        <div className="mt-4 flex justify-end">
          <button className="btn-primary" onClick={() => setNewToken(null)}>
            {t('common.save')}
          </button>
        </div>
      </Modal>
    {/* Test communication */}
      <Modal
        open={testOpen}
        title={t('devices.test')}
        onClose={() => {
          setTestOpen(false);
          setTestResult(null);
          setTestDeviceId('');
        }}
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t('devices.testSelect')}</label>
            <select
              className="input"
              value={testDeviceId}
              onChange={(e) => {
                setTestDeviceId(e.target.value);
                setTestResult(null);
              }}
            >
              <option value="">{t('common.noData')}</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.deviceId} — {d.vendor} {d.model} ({d.ipAddress ?? 'no IP'})
                </option>
              ))}
            </select>
          </div>

          {testResult ? (
            <div
              className={`rounded-lg border px-3 py-2 text-sm ${
                testResult.reachable ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'
              }`}
            >
              <p className="font-medium">
                {testResult.reachable ? `✓ ${t('devices.reachable')}` : `✗ ${t('devices.unreachable')}`}
              </p>
              <p className="mt-1">{testResult.message}</p>
              {testResult.target ? (
                <p className="mt-1 text-xs opacity-80" dir="ltr">
                  {t('common.total')}: {testResult.target}
                  {testResult.latencyMs != null ? ` · ${t('devices.latency')}: ${testResult.latencyMs}ms` : ''}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <button className="btn-ghost" onClick={() => setTestOpen(false)}>
              {t('common.cancel')}
            </button>
            <button className="btn-primary" disabled={testing || !testDeviceId} onClick={() => void testCommunication()}>
              {testing ? t('common.loading') : t('devices.testButton')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}