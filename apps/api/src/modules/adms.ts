// ZKTeco ADMS / "iclock" PUSH protocol support.
//
// Devices call out to the server over HTTP(S):
//   GET  /iclock/cdata?SN=..&options=all   -> handshake, server returns options
//   POST /iclock/cdata?SN=..&table=ATTLOG  -> attendance punches
//   POST /iclock/cdata?SN=..&table=OPERLOG -> users, fingerprint (FP) and face templates
//   POST /iclock/cdata?SN=..&table=BIODATA -> templates on newer firmware
//   GET  /iclock/getrequest?SN=..          -> server hands out queued commands ("C:<id>:<cmd>")
//   POST /iclock/devicecmd?SN=..           -> device reports command results
// Devices are identified by serial number only (a limitation of the protocol), so only
// serial numbers registered in AttendIQ as protocol "http-push" are accepted.

import type { Device, Employee } from '@attendiq/db';
import { prisma, Prisma } from '../lib/db.js';
import { decryptTemplate, encryptTemplate, templateHash } from '../lib/biometric-crypto.js';
import { recalculateEmployeeDay } from './attendance.js';

export const ADMS_PROTOCOL = 'http-push';

// ---------- Time zones ----------

export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function tzOffsetMs(timeZone: string, ts: number): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(ts))) parts[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - Math.floor(ts / 1000) * 1000;
}

/** Converts a device wall-clock time ("2026-09-27 08:01:02") in `timeZone` to a UTC Date. */
export function zonedLocalToUtc(local: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(local.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number) as [number, number, number, number, number, number];
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  let ts = asUtc - tzOffsetMs(timeZone, asUtc);
  ts = asUtc - tzOffsetMs(timeZone, ts); // second pass settles DST edges
  return new Date(ts);
}

/** Whole-hour offset used for the device "TimeZone" option (e.g. Asia/Dubai -> 4). */
export function tzOffsetHours(timeZone: string): number {
  return Math.round(tzOffsetMs(timeZone, Date.now()) / 3_600_000);
}

// ---------- Device lookup & state ----------

export type AdmsDevice = Device & { branch: { timezone: string } | null; tenant: { timezone: string } };

export async function findAdmsDevice(sn: string | undefined): Promise<AdmsDevice | null> {
  const serial = sn?.trim();
  if (!serial) return null;
  const matches = await prisma.device.findMany({
    where: { serialNumber: { equals: serial, mode: 'insensitive' }, protocol: ADMS_PROTOCOL, isActive: true },
    include: { branch: { select: { timezone: true } }, tenant: { select: { timezone: true } } },
    take: 2,
  });
  // A serial number must identify exactly one device.
  return matches.length === 1 ? (matches[0] as AdmsDevice) : null;
}

export function deviceTimeZone(device: AdmsDevice): string {
  if (isValidTimeZone(device.branch?.timezone) && device.branch?.timezone !== 'UTC') return device.branch!.timezone;
  if (isValidTimeZone(device.tenant.timezone)) return device.tenant.timezone;
  return 'UTC';
}

export interface AdmsState {
  pushver?: string;
  attlogStamp?: string;
  operlogStamp?: string;
  biodataStamp?: string;
  attphotoStamp?: string;
  firmware?: string;
  userCount?: number;
  fpCount?: number;
  attCount?: number;
  deviceIp?: string;
  fpVersion?: string;
  faceVersion?: string;
  usesBiodata?: boolean;
  lastHandshakeAt?: string;
}

export function admsState(device: Pick<Device, 'diagnostics'>): AdmsState {
  const diag = (device.diagnostics ?? {}) as Record<string, unknown>;
  return ((diag.adms as AdmsState | undefined) ?? {}) as AdmsState;
}

export async function saveAdmsState(
  device: Pick<Device, 'id' | 'diagnostics'>,
  patch: Partial<AdmsState>,
  extra: Prisma.DeviceUpdateInput = {},
): Promise<void> {
  const diag = (device.diagnostics ?? {}) as Record<string, unknown>;
  const next = { ...diag, adms: { ...admsState(device), ...patch } };
  await prisma.device.update({
    where: { id: device.id },
    data: { ...extra, diagnostics: next as Prisma.InputJsonValue },
  });
}

/** Parses the INFO query value sent with getrequest. */
export function parseInfo(info: string | undefined): Partial<AdmsState> {
  if (!info) return {};
  const f = info.split(',').map((x) => x.trim());
  const num = (v?: string): number | undefined => (v && /^\d+$/.test(v) ? Number(v) : undefined);
  return {
    firmware: f[0] || undefined,
    userCount: num(f[1]),
    fpCount: num(f[2]),
    attCount: num(f[3]),
    deviceIp: f[4] || undefined,
    fpVersion: f[5] || undefined,
    faceVersion: f[6] || undefined,
  };
}

// ---------- Body parsing ----------

export interface ParsedRecord {
  kind: string;
  fields: [string, string][];
}

export function fieldOf(rec: ParsedRecord, name: string): string | undefined {
  const lower = name.toLowerCase();
  return rec.fields.find(([k]) => k.toLowerCase() === lower)?.[1];
}

/** Parses "FP PIN=1\tFID=6\tTMP=..." style lines. Values may contain '='. */
export function parseKeyValueLine(line: string, defaultKind: string): ParsedRecord | null {
  const trimmed = line.replace(/\r$/, '');
  if (!trimmed.trim()) return null;
  let kind = defaultKind;
  let rest = trimmed;
  const space = trimmed.indexOf(' ');
  const eq = trimmed.indexOf('=');
  if (space > 0 && (eq === -1 || space < eq)) {
    kind = trimmed.slice(0, space).toUpperCase();
    rest = trimmed.slice(space + 1);
  }
  const fields: [string, string][] = [];
  for (const part of rest.split('\t')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    fields.push([part.slice(0, i).trim(), part.slice(i + 1)]);
  }
  return { kind, fields };
}

export interface AttLogLine {
  pin: string;
  time: string;
  status: number | null;
  verify: number | null;
  workcode: string | null;
}

/** ATTLOG lines: PIN \t YYYY-MM-DD HH:MM:SS \t status \t verify \t workcode ... */
export function parseAttLog(body: string): AttLogLine[] {
  const out: AttLogLine[] = [];
  for (const raw of body.split('\n')) {
    const cols = raw.replace(/\r$/, '').split('\t');
    const pin = cols[0]?.trim();
    const time = cols[1]?.trim();
    if (!pin || !time) continue;
    const n = (v?: string): number | null => (v !== undefined && /^-?\d+$/.test(v.trim()) ? Number(v) : null);
    out.push({ pin, time, status: n(cols[2]), verify: n(cols[3]), workcode: cols[4]?.trim() || null });
  }
  return out;
}

/** ZK status codes: 0 in, 1 out, 2 break-out, 3 break-in, 4 OT-in, 5 OT-out. */
export function punchTypeFor(status: number | null): 'CHECK_IN' | 'CHECK_OUT' | 'UNKNOWN' {
  if (status === 0 || status === 3 || status === 4) return 'CHECK_IN';
  if (status === 1 || status === 2 || status === 5) return 'CHECK_OUT';
  return 'UNKNOWN';
}

// ---------- Attendance ingest ----------

export async function ingestAttLog(device: AdmsDevice, lines: AttLogLine[]): Promise<{ accepted: number; unknownUsers: number }> {
  if (lines.length === 0) return { accepted: 0, unknownUsers: 0 };
  const tz = deviceTimeZone(device);
  const pins = [...new Set(lines.map((l) => l.pin))];
  const employees = await prisma.employee.findMany({
    where: { tenantId: device.tenantId, deviceUserId: { in: pins } },
    select: { id: true, deviceUserId: true },
  });
  const byPin = new Map(employees.map((e) => [e.deviceUserId, e.id]));
  const serial = device.serialNumber ?? device.deviceId;

  const rows = lines
    .map((l) => ({ l, at: zonedLocalToUtc(l.time, tz) }))
    .filter((x): x is { l: AttLogLine; at: Date } => x.at !== null);

  await prisma.deviceEvent.createMany({
    data: rows.map(({ l }) => ({
      tenantId: device.tenantId,
      deviceId: device.id,
      dedupeKey: `evt:${serial}:${l.pin}:${l.time}`,
      raw: { source: 'adms', pin: l.pin, time: l.time, status: l.status, verify: l.verify, workcode: l.workcode, timeZone: tz },
      status: 'PROCESSED' as const,
    })),
    skipDuplicates: true,
  });

  const tx = rows
    .filter(({ l }) => byPin.has(l.pin))
    .map(({ l, at }) => ({
      tenantId: device.tenantId,
      dedupeKey: `tx:${serial}:${l.pin}:${l.time}`,
      source: 'DEVICE' as const,
      deviceId: device.id,
      employeeId: byPin.get(l.pin)!,
      deviceUserId: l.pin,
      timestamp: at,
      punchType: punchTypeFor(l.status),
      payload: { source: 'adms', status: l.status, verify: l.verify, localTime: l.time, timeZone: tz },
      status: 'PROCESSED' as const,
    }));
  const created = await prisma.attendanceTransaction.createMany({ data: tx, skipDuplicates: true });

  // The device's own local date is the attendance day.
  const days = new Map<string, Set<string>>();
  for (const row of tx) {
    const date = (row.payload.localTime as string).slice(0, 10);
    const set = days.get(row.employeeId) ?? new Set<string>();
    set.add(date);
    days.set(row.employeeId, set);
  }
  for (const [employeeId, dates] of days) {
    for (const date of dates) {
      await recalculateEmployeeDay({ tenantId: device.tenantId, employeeId, date, triggeredBy: `adms:${serial}` });
    }
  }
  if (tx.length > 0) {
    await prisma.device.update({ where: { id: device.id }, data: { lastTransactionAt: new Date() } });
  }
  return { accepted: created.count, unknownUsers: rows.length - tx.length };
}

// ---------- Templates ----------

type TemplateFormat = 'FINGERTMP' | 'FACE' | 'BIODATA';

function templateKeyFor(format: TemplateFormat): string {
  return format === 'BIODATA' ? 'Tmp' : 'TMP';
}

function biometricTypeFor(format: TemplateFormat, bioType?: string): string {
  if (format === 'FINGERTMP') return 'FINGERPRINT';
  if (format === 'FACE') return 'FACE';
  if (bioType === '1') return 'FINGERPRINT';
  if (bioType === '2' || bioType === '9') return 'FACE';
  return `BIO_${bioType ?? 'X'}`;
}

/** Normalises an uploaded FP / FACE / BIODATA record and stores it; returns true when new or changed. */
export async function storeTemplate(device: AdmsDevice, rec: ParsedRecord): Promise<'stored' | 'unchanged' | 'skipped'> {
  const format: TemplateFormat | null =
    rec.kind === 'FP' || rec.kind === 'FINGERTMP' ? 'FINGERTMP' : rec.kind === 'FACE' ? 'FACE' : rec.kind === 'BIODATA' ? 'BIODATA' : null;
  if (!format) return 'skipped';
  const pin = fieldOf(rec, 'PIN');
  const tmpKey = templateKeyFor(format);
  const tmp = fieldOf(rec, tmpKey);
  const valid = fieldOf(rec, 'Valid');
  if (!pin || !tmp || valid === '0') return 'skipped';

  const employee = await prisma.employee.findFirst({
    where: { tenantId: device.tenantId, deviceUserId: pin },
    select: { id: true, branchId: true },
  });
  if (!employee) return 'skipped';

  const indexRaw = format === 'BIODATA' ? fieldOf(rec, 'No') : fieldOf(rec, 'FID');
  const fingerIndex = indexRaw && /^\d+$/.test(indexRaw) ? Number(indexRaw) : 0;
  const type = biometricTypeFor(format, fieldOf(rec, 'Type'));
  const hash = templateHash(tmp);
  const state = admsState(device);
  const meta = {
    fields: rec.fields.filter(([k]) => k.toLowerCase() !== tmpKey.toLowerCase() && k.toLowerCase() !== 'pin'),
    hash,
    fpVersion: state.fpVersion ?? null,
    faceVersion: state.faceVersion ?? null,
    sourceSerial: device.serialNumber,
  };

  const existing = await prisma.biometricIdentifier.findFirst({
    where: { tenantId: device.tenantId, employeeId: employee.id, format, type, fingerIndex },
  });
  if (existing && (existing.meta as { hash?: string } | null)?.hash === hash) return 'unchanged';

  const saved = existing
    ? await prisma.biometricIdentifier.update({
        where: { id: existing.id },
        data: { encryptedRef: encryptTemplate(tmp), meta, deviceId: device.id, enrolledAt: new Date() },
      })
    : await prisma.biometricIdentifier.create({
        data: { tenantId: device.tenantId, employeeId: employee.id, type, format, fingerIndex, encryptedRef: encryptTemplate(tmp), meta, deviceId: device.id },
      });

  // Copy the new template to the employee's other devices.
  const targets = (await eligibleDevicesForEmployee(device.tenantId, employee.branchId)).filter((d) => d.id !== device.id);
  for (const target of targets) {
    await queueCommand({ tenantId: device.tenantId, deviceId: target.id, kind: 'USER', employeeId: employee.id });
    if (templateCompatible(saved, target)) {
      await queueCommand({ tenantId: device.tenantId, deviceId: target.id, kind: 'TEMPLATE', employeeId: employee.id, biometricId: saved.id });
    }
  }
  return 'stored';
}

function templateCompatible(bio: { type: string; meta: Prisma.JsonValue }, device: Pick<Device, 'diagnostics'>): boolean {
  const meta = (bio.meta ?? {}) as { fpVersion?: string | null; faceVersion?: string | null };
  const state = admsState(device);
  if (bio.type === 'FINGERPRINT' && meta.fpVersion && state.fpVersion) return meta.fpVersion === state.fpVersion;
  if (bio.type === 'FACE' && meta.faceVersion && state.faceVersion) return meta.faceVersion === state.faceVersion;
  return true;
}

// ---------- Command queue ----------

export async function eligibleDevicesForEmployee(tenantId: string, employeeBranchId: string | null): Promise<Device[]> {
  return prisma.device.findMany({
    where: {
      tenantId,
      protocol: ADMS_PROTOCOL,
      isActive: true,
      ...(employeeBranchId ? { OR: [{ branchId: null }, { branchId: employeeBranchId }] } : {}),
    },
  });
}

export async function queueCommand(input: {
  tenantId: string;
  deviceId: string;
  kind: 'USER' | 'TEMPLATE' | 'DELETE_USER' | 'ENROLL' | 'RAW';
  employeeId?: string;
  biometricId?: string;
  fingerIndex?: number;
  command?: string;
}): Promise<{ id: number; created: boolean }> {
  // Skip exact duplicates that have not been delivered yet (e.g. "sync" pressed twice).
  if (input.kind !== 'RAW' && input.kind !== 'ENROLL') {
    const dup = await prisma.deviceCommand.findFirst({
      where: {
        deviceId: input.deviceId,
        kind: input.kind,
        employeeId: input.employeeId ?? null,
        biometricId: input.biometricId ?? null,
        status: 'PENDING',
      },
      select: { id: true },
    });
    if (dup) return { id: dup.id, created: false };
  }
  const row = await prisma.deviceCommand.create({
    data: {
      tenantId: input.tenantId,
      deviceId: input.deviceId,
      kind: input.kind,
      employeeId: input.employeeId,
      biometricId: input.biometricId,
      fingerIndex: input.fingerIndex,
      command: input.command,
    },
    select: { id: true },
  });
  return { id: row.id, created: true };
}

/** Queues the employee (and optionally their stored templates) to one device. */
export async function queueEmployeeToDevice(
  employee: Pick<Employee, 'id' | 'tenantId'>,
  device: Pick<Device, 'id' | 'diagnostics'>,
  withTemplates: boolean,
): Promise<number> {
  let queued = 0;
  const user = await queueCommand({ tenantId: employee.tenantId, deviceId: device.id, kind: 'USER', employeeId: employee.id });
  if (user.created) queued++;
  if (!withTemplates) return queued;
  const templates = await prisma.biometricIdentifier.findMany({
    where: { tenantId: employee.tenantId, employeeId: employee.id, encryptedRef: { not: null }, format: { not: null } },
  });
  for (const bio of templates) {
    if (!templateCompatible(bio, device)) continue;
    const r = await queueCommand({ tenantId: employee.tenantId, deviceId: device.id, kind: 'TEMPLATE', employeeId: employee.id, biometricId: bio.id });
    if (r.created) queued++;
  }
  return queued;
}

function cleanName(first: string, last: string): string {
  return `${first} ${last}`.replace(/[\t\r\n]+/g, ' ').trim().slice(0, 24);
}

/** Builds the device command text at send time (templates are decrypted only here). */
export async function buildCommandText(
  cmd: { kind: string; employeeId: string | null; biometricId: string | null; fingerIndex: number | null; command: string | null },
  device: Pick<Device, 'diagnostics'>,
): Promise<string> {
  if (cmd.kind === 'RAW') {
    if (!cmd.command) throw new Error('Empty command');
    return cmd.command;
  }
  const employee = cmd.employeeId ? await prisma.employee.findUnique({ where: { id: cmd.employeeId } }) : null;
  if (!employee) throw new Error('Employee no longer exists');
  const pin = employee.deviceUserId?.trim();
  if (!pin) throw new Error('Employee has no Device user ID');

  switch (cmd.kind) {
    case 'USER':
      return `DATA UPDATE USERINFO PIN=${pin}\tName=${cleanName(employee.firstName, employee.lastName)}`;
    case 'DELETE_USER':
      return `DATA DELETE USERINFO PIN=${pin}`;
    case 'ENROLL': {
      const fid = cmd.fingerIndex ?? 0;
      return admsState(device).usesBiodata
        ? `ENROLL_BIO TYPE=1\tPIN=${pin}\tNO=${fid}\tRETRY=3\tOVERWRITE=1`
        : `ENROLL_FP PIN=${pin}\tFID=${fid}\tRETRY=3\tOVERWRITE=1`;
    }
    case 'TEMPLATE': {
      const bio = cmd.biometricId ? await prisma.biometricIdentifier.findUnique({ where: { id: cmd.biometricId } }) : null;
      if (!bio?.encryptedRef || !bio.format) throw new Error('Template no longer exists');
      const tmp = decryptTemplate(bio.encryptedRef);
      const meta = (bio.meta ?? {}) as { fields?: [string, string][] };
      const fields = (meta.fields ?? []).map(([k, v]) => `${k}=${v}`);
      const format = bio.format as TemplateFormat;
      const pinKey = format === 'BIODATA' ? 'Pin' : 'PIN';
      return `DATA UPDATE ${format} ${[`${pinKey}=${pin}`, ...fields, `${templateKeyFor(format)}=${tmp}`].join('\t')}`;
    }
    default:
      throw new Error(`Unknown command kind ${cmd.kind}`);
  }
}

export function describeReturnCode(code: number): string {
  const known: Record<number, string> = {
    [-1]: 'Command not supported by this device/firmware, or invalid parameters',
    [-2]: 'Device could not save the data',
    [-3]: 'Device storage or access error',
    [-10]: 'User does not exist on the device',
    [-11]: 'Invalid template format',
    [-12]: 'Invalid template',
  };
  return known[code] ?? `Device returned error code ${code}`;
}
