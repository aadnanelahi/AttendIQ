'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n-client';
import { Modal } from '@/components/Modal';
import { useConfirm } from '@/components/ConfirmProvider';

interface Props {
  employee: { id: string; firstName: string; lastName: string; deviceUserId?: string | null } | null;
  onClose: () => void;
}

interface Template {
  id: string;
  type: string;
  fingerIndex: number | null;
  format: string | null;
  enrolledAt: string;
  deviceId: string | null;
}

interface Device {
  id: string;
  deviceId: string;
  model: string;
  protocol: string;
  isActive: boolean;
  lastSeenAt: string | null;
}

interface Command {
  id: number;
  kind: string;
  status: string;
  fingerIndex: number | null;
  error: string | null;
  createdAt: string;
  device?: { deviceId: string; model: string } | null;
}

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  SENT: 'bg-sky-50 text-sky-700',
  DONE: 'bg-emerald-50 text-emerald-700',
  FAILED: 'bg-red-50 text-red-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.fieldErrors) {
    const first = Object.values(err.fieldErrors)[0];
    if (first) return String(first);
  }
  return err instanceof Error ? err.message : fallback;
}

export function EmployeeBiometrics({ employee, onClose }: Props): React.JSX.Element {
  const { t } = useI18n();
  const confirm = useConfirm();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [commands, setCommands] = useState<Command[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [finger, setFinger] = useState('6');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const employeeId = employee?.id;
  const hasPin = !!employee?.deviceUserId?.trim();

  const refresh = useCallback(() => {
    if (!employeeId) return;
    api<Template[]>(`/employees/${employeeId}/biometrics`)
      .then(setTemplates)
      .catch(() => {});
    api<Command[]>(`/employees/${employeeId}/device-commands`)
      .then(setCommands)
      .catch(() => {});
  }, [employeeId]);

  useEffect(() => {
    if (!employeeId) return;
    setMessage(null);
    setTemplates([]);
    setCommands([]);
    refresh();
    api<{ items: Device[] }>('/devices?pageSize=200')
      .then((r) => {
        const push = r.items.filter((d) => d.protocol === 'http-push' && d.isActive);
        setDevices(push);
        setDeviceId((cur) => cur || push[0]?.id || '');
      })
      .catch(() => {});
  }, [employeeId, refresh]);

  // Poll while anything is still on its way to a device.
  const inFlight = commands.some((c) => c.status === 'PENDING' || c.status === 'SENT');
  useEffect(() => {
    if (!employeeId || !inFlight) return;
    const timer = window.setInterval(refresh, 4000);
    return () => window.clearInterval(timer);
  }, [employeeId, inFlight, refresh]);

  async function run(action: () => Promise<string>): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      setMessage({ text: await action() });
      refresh();
    } catch (err) {
      setMessage({ text: errorMessage(err, t('common.error')), error: true });
    } finally {
      setBusy(false);
    }
  }

  const push = (): Promise<void> =>
    run(async () => {
      const r = await api<{ devices: number; commands: number }>(`/employees/${employeeId}/push-to-devices`, { method: 'POST', body: {} });
      return r.devices === 0 ? t('biometrics.noDevices') : t('biometrics.pushed', { devices: r.devices, commands: r.commands });
    });

  async function removeFromDevices(): Promise<void> {
    if (!(await confirm(t('biometrics.removeConfirm'), { confirmLabel: t('biometrics.remove') }))) return;
    await run(async () => {
      const r = await api<{ devices: number }>(`/employees/${employeeId}/remove-from-devices`, { method: 'POST', body: {} });
      return t('biometrics.removed', { devices: r.devices });
    });
  }

  const enroll = (): Promise<void> =>
    run(async () => {
      await api(`/employees/${employeeId}/enroll-fingerprint`, { method: 'POST', body: { deviceId, fingerIndex: Number(finger) } });
      return t('biometrics.enrollQueued');
    });

  async function deleteTemplate(id: string): Promise<void> {
    if (!(await confirm(t('biometrics.confirmDeleteTemplate')))) return;
    await run(async () => {
      await api(`/employees/${employeeId}/biometrics/${id}`, { method: 'DELETE' });
      return t('common.delete') + ' ✓';
    });
  }

  const templateLabel = (tpl: Template): string =>
    tpl.type === 'FINGERPRINT' ? `${t('biometrics.finger')}: ${t(`biometrics.f${tpl.fingerIndex ?? 0}`)}` : tpl.type === 'FACE' ? t('biometrics.face') : tpl.type;
  const label = 'mb-1 block text-sm font-medium text-slate-700';

  return (
    <Modal
      open={employee !== null}
      title={`${t('biometrics.title')} — ${employee ? `${employee.firstName} ${employee.lastName}` : ''}`}
      onClose={onClose}
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          {t('biometrics.deviceUserId')}:{' '}
          <span className="font-mono font-medium text-slate-900" dir="ltr">
            {employee?.deviceUserId || '—'}
          </span>
        </p>
        {!hasPin ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{t('biometrics.noDeviceUserId')}</p> : null}

        {message ? (
          <p className={`rounded-lg px-3 py-2 text-sm ${message.error ? 'bg-red-50 text-red-700' : 'bg-sky-50 text-sky-800'}`}>{message.text}</p>
        ) : null}

        {/* Stored templates */}
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-800">{t('biometrics.stored')}</h3>
          {templates.length === 0 ? (
            <p className="text-sm text-slate-500">{t('biometrics.none')}</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {templates.map((tpl) => (
                <li key={tpl.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span>
                    {templateLabel(tpl)}
                    <span className="block text-xs text-slate-400" dir="ltr">
                      {new Date(tpl.enrolledAt).toLocaleString()}
                    </span>
                  </span>
                  <button className="btn-ghost px-3 py-1 text-xs text-red-600" onClick={() => void deleteTemplate(tpl.id)}>
                    {t('common.delete')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Push / remove */}
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={busy || !hasPin} onClick={() => void push()}>
            {t('biometrics.push')}
          </button>
          <button className="btn-ghost text-red-600" disabled={busy || !hasPin} onClick={() => void removeFromDevices()}>
            {t('biometrics.remove')}
          </button>
        </div>

        {/* Enroll */}
        <div className="rounded-lg border border-slate-200 p-3">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">{t('biometrics.enroll')}</h3>
          {devices.length === 0 ? (
            <p className="text-sm text-slate-500">{t('biometrics.noDevices')}</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>{t('biometrics.enrollDevice')}</label>
                  <select className="input" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
                    {devices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.deviceId} — {d.model}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={label}>{t('biometrics.enrollFinger')}</label>
                  <select className="input" value={finger} onChange={(e) => setFinger(e.target.value)}>
                    {Array.from({ length: 10 }, (_, i) => (
                      <option key={i} value={String(i)}>
                        {t(`biometrics.f${i}`)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500">{t('biometrics.enrollHint')}</p>
              <div className="mt-3 flex justify-end">
                <button className="btn-primary" disabled={busy || !hasPin || !deviceId} onClick={() => void enroll()}>
                  {t('biometrics.enrollStart')}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Activity */}
        {commands.length > 0 ? (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-800">{t('biometrics.activity')}</h3>
            <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
              {commands.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-3">
                  <span>
                    {t(`biometrics.kind_${c.kind}`)}
                    {c.kind === 'ENROLL' && c.fingerIndex != null ? ` (${t(`biometrics.f${c.fingerIndex}`)})` : ''}
                    <span className="text-xs text-slate-400"> · {c.device?.deviceId ?? ''}</span>
                    {c.error ? <span className="block text-xs text-red-600">{c.error}</span> : null}
                  </span>
                  <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[c.status] ?? ''}`}>
                    {t(`biometrics.status_${c.status}`)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
