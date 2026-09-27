'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, apiEnvelope, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n-client';
import { PageHeader } from '@/components/PageHeader';
import { useConfirm } from '@/components/ConfirmProvider';
import { StatusBadge } from '@/components/StatusBadge';
import { Modal } from '@/components/Modal';

interface AdmsInfo {
  firmware?: string;
  userCount?: number;
  fpCount?: number;
  deviceIp?: string;
  lastHandshakeAt?: string;
}

interface Device {
  id: string;
  deviceId: string;
  vendor: string;
  model: string;
  serialNumber: string | null;
  ipAddress: string | null;
  port?: number | null;
  protocol: string;
  isActive: boolean;
  lastSeenAt: string | null;
  branchId?: string | null;
  locationId?: string | null;
  branch?: { name: string } | null;
  location?: { name: string } | null;
  diagnostics?: { adms?: AdmsInfo } | null;
}

interface Named {
  id: string;
  name: string;
  branchId?: string | null;
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

interface Command {
  id: number;
  kind: string;
  status: string;
  employeeId: string | null;
  fingerIndex: number | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface CommandList {
  items: Command[];
  pending: number;
  employees: { id: string; firstName: string; lastName: string; deviceUserId: string | null }[];
}

const ADMS = 'http-push';
const ADMS_SERVER = process.env.NEXT_PUBLIC_ADMS_SERVER ?? '';

const EMPTY_FORM = {
  id: '',
  vendor: 'ZKTeco',
  model: '',
  deviceId: '',
  serialNumber: '',
  ipAddress: '',
  port: '',
  protocol: ADMS,
  branchId: '',
  locationId: '',
};

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.fieldErrors) {
    const first = Object.values(err.fieldErrors)[0];
    if (first) return String(first);
  }
  return err instanceof Error ? err.message : fallback;
}

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  SENT: 'bg-sky-50 text-sky-700',
  DONE: 'bg-emerald-50 text-emerald-700',
  FAILED: 'bg-red-50 text-red-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

export default function DevicesPage(): React.JSX.Element {
  const { t } = useI18n();
  const confirm = useConfirm();
  const [devices, setDevices] = useState<Device[]>([]);
  const [branches, setBranches] = useState<Named[]>([]);
  const [locations, setLocations] = useState<Named[]>([]);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [rotateDeviceId, setRotateDeviceId] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testDeviceId, setTestDeviceId] = useState('');
  const [testResult, setTestResult] = useState<DeviceTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [commandsFor, setCommandsFor] = useState<Device | null>(null);
  const [commands, setCommands] = useState<CommandList | null>(null);

  const load = useCallback(() => {
    api<Paged<Device>>('/devices?pageSize=200')
      .then((r) => setDevices(r.items))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    api<Paged<Named>>('/branches?pageSize=200')
      .then((r) => setBranches(r.items))
      .catch(() => {});
    api<Paged<Named>>('/locations?pageSize=200')
      .then((r) => setLocations(r.items))
      .catch(() => {});
  }, [load]);

  // Refresh the command list while it is open.
  const loadCommands = useCallback((deviceId: string) => {
    api<CommandList>(`/devices/${deviceId}/commands`)
      .then(setCommands)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!commandsFor) return;
    loadCommands(commandsFor.id);
    const timer = window.setInterval(() => loadCommands(commandsFor.id), 5000);
    return () => window.clearInterval(timer);
  }, [commandsFor, loadCommands]);

  function set<K extends keyof typeof EMPTY_FORM>(key: K, value: string): void {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function openAdd(): void {
    setError(null);
    setForm({ ...EMPTY_FORM });
    setShowForm(true);
  }

  function openEdit(d: Device): void {
    setError(null);
    setForm({
      id: d.id,
      vendor: d.vendor,
      model: d.model,
      deviceId: d.deviceId,
      serialNumber: d.serialNumber ?? '',
      ipAddress: d.ipAddress ?? '',
      port: d.port != null ? String(d.port) : '',
      protocol: d.protocol,
      branchId: d.branchId ?? '',
      locationId: d.locationId ?? '',
    });
    setShowForm(true);
  }

  async function saveDevice(): Promise<void> {
    if (form.protocol === ADMS && !form.serialNumber.trim()) {
      setError(t('devices.serialRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = {
      vendor: form.vendor,
      model: form.model,
      deviceId: form.deviceId,
      serialNumber: form.serialNumber.trim() || undefined,
      ipAddress: form.ipAddress || undefined,
      port: form.port ? Number(form.port) : undefined,
      protocol: form.protocol,
      branchId: form.branchId || undefined,
      locationId: form.locationId || undefined,
    };
    try {
      if (form.id) {
        await api<Device>(`/devices/${form.id}`, { method: 'PUT', body });
        setShowForm(false);
        load();
      } else {
        const res = await apiEnvelope<Device>('/devices', { method: 'POST', body });
        setShowForm(false);
        // ADMS devices authenticate by serial number, so their token is not needed.
        if (form.protocol !== ADMS) setNewToken((res.deviceToken as string | undefined) ?? null);
        else setSetupOpen(true);
        load();
      }
      setForm({ ...EMPTY_FORM });
    } catch (err) {
      setError(errorMessage(err, t('common.error')));
    } finally {
      setBusy(false);
    }
  }

  async function syncEmployees(d: Device): Promise<void> {
    if (!(await confirm(t('devices.syncConfirm'), { confirmLabel: t('devices.syncEmployees') }))) return;
    try {
      const r = await api<{ employees: number; commands: number }>(`/devices/${d.id}/sync-employees`, { method: 'POST', body: {} });
      setNotice(t('devices.syncQueued', { employees: r.employees, commands: r.commands }));
    } catch (err) {
      setNotice(errorMessage(err, t('common.error')));
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
    if (!(await confirm('Delete this device?'))) return;
    await api(`/devices/${id}`, { method: 'DELETE' })
      .then(() => load())
      .catch(() => {});
  }

  const label = 'mb-1 block text-sm font-medium text-slate-700';
  const employeeName = (id: string | null): string => {
    const e = commands?.employees.find((x) => x.id === id);
    return e ? `${e.firstName} ${e.lastName} (#${e.deviceUserId ?? '—'})` : '—';
  };
  const setupRows: [string, string][] = [
    [t('devices.admsServer'), ADMS_SERVER],
    [t('devices.admsPort'), '443'],
    [t('devices.admsHttps'), t('devices.admsOn')],
    [t('devices.admsProxy'), t('devices.admsOff')],
  ];

  return (
    <div>
      <PageHeader
        title={t('devices.title')}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-ghost" onClick={() => setSetupOpen(true)}>
              {t('devices.admsSetup')}
            </button>
            <button className="btn-ghost" onClick={() => setTestOpen(true)}>
              {t('devices.test')}
            </button>
            <button className="btn-primary" onClick={openAdd}>
              + {t('devices.add')}
            </button>
          </div>
        }
      />
      {notice ? (
        <p className="mb-4 flex items-start justify-between gap-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss">
            ×
          </button>
        </p>
      ) : null}
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>{t('devices.deviceId')}</th>
              <th>{t('devices.model')}</th>
              <th>{t('devices.serialNumber')}</th>
              <th>{t('devices.branch')}</th>
              <th>{t('devices.protocol')}</th>
              <th>{t('devices.lastContact')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => {
              const adms = d.diagnostics?.adms;
              const isAdms = d.protocol === ADMS;
              return (
                <tr key={d.id}>
                  <td className="font-mono text-xs font-medium text-slate-900">{d.deviceId}</td>
                  <td className="text-slate-900">
                    {d.vendor} {d.model}
                    {isAdms && adms?.firmware ? (
                      <span className="block text-xs text-slate-400" dir="ltr">
                        {adms.firmware}
                        {adms.userCount != null ? ` · ${t('devices.users')}: ${adms.userCount}` : ''}
                        {adms.fpCount != null ? ` · ${t('devices.fingerprints')}: ${adms.fpCount}` : ''}
                      </span>
                    ) : null}
                  </td>
                  <td className="font-mono text-xs text-slate-500" dir="ltr">{d.serialNumber ?? '—'}</td>
                  <td className="text-slate-500">{d.branch?.name ?? '—'}</td>
                  <td className="text-slate-500">{isAdms ? t('devices.protocolAdms') : d.protocol}</td>
                  <td className="text-slate-500" dir="ltr">
                    {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : isAdms ? t('devices.neverConnected') : '—'}
                  </td>
                  <td>
                    <StatusBadge value={d.isActive ? 'ACTIVE' : 'INACTIVE'} />
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      {isAdms ? (
                        <>
                          <button className="btn-ghost px-3 py-1 text-xs" onClick={() => void syncEmployees(d)}>
                            {t('devices.syncEmployees')}
                          </button>
                          <button
                            className="btn-ghost px-3 py-1 text-xs"
                            onClick={() => {
                              setCommands(null);
                              setCommandsFor(d);
                            }}
                          >
                            {t('devices.commands')}
                          </button>
                        </>
                      ) : (
                        <button className="btn-ghost px-3 py-1 text-xs" onClick={() => setRotateDeviceId(d.id)}>
                          {t('devices.rotate')}
                        </button>
                      )}
                      <button className="btn-ghost px-3 py-1 text-xs" onClick={() => openEdit(d)}>
                        {t('employees.edit')}
                      </button>
                      <button className="btn-ghost px-3 py-1 text-xs text-red-600" onClick={() => void removeDevice(d.id)}>
                        {t('common.delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
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

      {/* Add / edit device */}
      <Modal open={showForm} title={form.id ? t('devices.edit') : t('devices.add')} onClose={() => setShowForm(false)}>
        <div className="space-y-3">
          <div>
            <label className={label}>{t('devices.protocol')}</label>
            <select className="input" value={form.protocol} onChange={(e) => set('protocol', e.target.value)}>
              <option value="http-push">{t('devices.protocolAdms')}</option>
              <option value="zktcp">{t('devices.protocolTcp')}</option>
              <option value="zkcloud">zkcloud</option>
              <option value="mqtt">mqtt</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>{t('devices.vendor')}</label>
              <input className="input" value={form.vendor} onChange={(e) => set('vendor', e.target.value)} />
            </div>
            <div>
              <label className={label}>{t('devices.model')}</label>
              <input className="input" placeholder="e.g. SpeedFace V5L" value={form.model} onChange={(e) => set('model', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>{t('devices.deviceId')}</label>
              <input className="input" dir="ltr" placeholder="e.g. HQ-GATE-1" value={form.deviceId} onChange={(e) => set('deviceId', e.target.value)} />
            </div>
            <div>
              <label className={label}>{t('devices.serialNumber')}</label>
              <input className="input font-mono" dir="ltr" value={form.serialNumber} onChange={(e) => set('serialNumber', e.target.value)} />
            </div>
          </div>
          {form.protocol === ADMS ? <p className="text-xs text-slate-500">{t('devices.admsSerialHint')}</p> : null}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>{t('devices.branch')}</label>
              <select className="input" value={form.branchId} onChange={(e) => set('branchId', e.target.value)}>
                <option value="">—</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>{t('devices.location')}</label>
              <select className="input" value={form.locationId} onChange={(e) => set('locationId', e.target.value)}>
                <option value="">—</option>
                {locations
                  .filter((l) => !form.branchId || !l.branchId || l.branchId === form.branchId)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          {form.protocol === ADMS ? <p className="text-xs text-slate-500">{t('devices.admsBranchHint')}</p> : null}
          {form.protocol !== ADMS ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>{t('devices.ip')}</label>
                <input className="input" dir="ltr" value={form.ipAddress} onChange={(e) => set('ipAddress', e.target.value)} />
              </div>
              <div>
                <label className={label}>{t('devices.port')}</label>
                <input className="input" dir="ltr" type="number" value={form.port} onChange={(e) => set('port', e.target.value)} />
              </div>
            </div>
          ) : null}
          {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <button className="btn-ghost" onClick={() => setShowForm(false)}>
              {t('common.cancel')}
            </button>
            <button className="btn-primary" disabled={busy || !form.deviceId || !form.model} onClick={() => void saveDevice()}>
              {busy ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </div>
      </Modal>

      {/* ADMS setup instructions */}
      <Modal open={setupOpen} title={t('devices.admsSetup')} onClose={() => setSetupOpen(false)}>
        <p className="mb-3 text-sm text-slate-600">{t('devices.admsSetupIntro')}</p>
        <table className="w-full text-sm">
          <tbody>
            {setupRows.map(([k, v]) => (
              <tr key={k} className="border-b border-slate-100 last:border-0">
                <td className="py-2 pe-3 text-slate-500">{k}</td>
                <td className="py-2 font-mono font-medium text-slate-900" dir="ltr">
                  {v}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-slate-500">{t('devices.admsSerialHint')}</p>
        <div className="mt-4 flex justify-end">
          <button className="btn-primary" onClick={() => setSetupOpen(false)}>
            OK
          </button>
        </div>
      </Modal>

      {/* Command history */}
      <Modal open={commandsFor !== null} title={`${t('devices.commands')} — ${commandsFor?.deviceId ?? ''}`} onClose={() => setCommandsFor(null)}>
        {commands === null ? (
          <p className="text-sm text-slate-500">{t('common.loading')}</p>
        ) : (
          <div className="space-y-3">
            {commands.pending > 0 ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{t('devices.commandsPending', { count: commands.pending })}</p>
            ) : null}
            <div className="max-h-[50vh] overflow-y-auto">
              <table className="table-base">
                <tbody>
                  {commands.items.map((c) => (
                    <tr key={c.id}>
                      <td className="text-xs text-slate-500" dir="ltr">
                        {new Date(c.createdAt).toLocaleString()}
                      </td>
                      <td className="text-sm">
                        {t(`biometrics.kind_${c.kind}`)}
                        <span className="block text-xs text-slate-500">{employeeName(c.employeeId)}</span>
                        {c.error ? <span className="block text-xs text-red-600">{c.error}</span> : null}
                      </td>
                      <td>
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[c.status] ?? ''}`}>
                          {t(`biometrics.status_${c.status}`)}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {commands.items.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-slate-400">
                        {t('common.noData')}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        )}
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
          <button className="btn-primary" disabled={rotating} onClick={() => rotateDeviceId && void rotateToken(rotateDeviceId)}>
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
            <label className={label}>{t('devices.testSelect')}</label>
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
              <p className="font-medium">{testResult.reachable ? `✓ ${t('devices.reachable')}` : `✗ ${t('devices.unreachable')}`}</p>
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
