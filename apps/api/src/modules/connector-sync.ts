import { env } from '../env.js';
import { prisma, Prisma } from '../lib/db.js';
import { recalculateEmployeeDay } from './attendance.js';

interface ConnectorAttendanceRecord {
  uid: number;
  user_id: string;
  timestamp: string;
  status: number;
  punch: number;
  source: string;
}

interface ConnectorAttendanceResponse {
  success: boolean;
  count: number;
  records: ConnectorAttendanceRecord[];
}

interface DeviceWithToken {
  id: string;
  deviceId: string;
  tenantId: string;
  apiKeyId: string;
}

let syncTimer: NodeJS.Timeout | null = null;

export function startZkConnectorSync(): void {
  if (syncTimer) return;
  const baseUrl = env.zkConnectorBaseUrl?.replace(/\/$/, '');
  const deviceId = env.zkConnectorDeviceId;
  const intervalMs = env.zkConnectorSyncIntervalMs ?? 30000;

  if (!baseUrl || !deviceId) {
    console.log('[ZK Connector] Not configured (ZK_CONNECTOR_BASE_URL, ZK_CONNECTOR_DEVICE_ID)');
    return;
  }

  console.log(`[ZK Connector] Starting sync for device ${deviceId} from ${baseUrl} every ${intervalMs}ms`);

  async function syncOnce(): Promise<void> {
    try {
      const device = await prisma.device.findFirst({
        where: { deviceId, tenantId: { not: '' } },
        select: { id: true, deviceId: true, tenantId: true, apiKeyId: true },
      });
      if (!device) {
        console.warn(`[ZK Connector] Device ${deviceId} not found in AttendIQ`);
        return;
      }

      const res = await fetch(`${baseUrl}/api/v1/device/attendance`, {
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        console.error(`[ZK Connector] Failed to fetch attendance: ${res.status}`);
        return;
      }
      const data = (await res.json()) as ConnectorAttendanceResponse;
      if (!data.success || !data.records?.length) return;

      console.log(`[ZK Connector] Fetched ${data.records.length} records for ${deviceId}`);

      const userKeys = [...new Set(data.records.map((r) => r.user_id))];
      const employees = await prisma.employee.findMany({
        where: { tenantId: device.tenantId, deviceUserId: { in: userKeys } },
        select: { id: true, deviceUserId: true },
      });
      const byDeviceUser = new Map(employees.map((e) => [e.deviceUserId, e.id]));

      const events = data.records.map((r) => ({
        tenantId: device.tenantId,
        deviceId: device.id,
        dedupeKey: `evt:${device.deviceId}:${r.user_id}:${r.timestamp}`,
        raw: { userId: r.user_id, timestamp: r.timestamp, type: r.status === 1 ? 'CHECK_IN' : 'CHECK_OUT' },
        status: 'PROCESSED' as const,
      }));
      await prisma.deviceEvent.createMany({ data: events, skipDuplicates: true });

      const txData = data.records
        .filter((r) => byDeviceUser.has(r.user_id))
        .map((r) => ({
          tenantId: device.tenantId,
          dedupeKey: `tx:${device.deviceId}:${r.user_id}:${r.timestamp}`,
          source: 'DEVICE' as const,
          deviceId: device.id,
          employeeId: byDeviceUser.get(r.user_id)!,
          deviceUserId: r.user_id,
          timestamp: new Date(r.timestamp),
          punchType: (r.status === 1 ? 'CHECK_IN' : 'CHECK_OUT') as 'CHECK_IN' | 'CHECK_OUT' | 'UNKNOWN',
          payload: r as object,
          status: 'PROCESSED' as const,
        }));
      const txResult = await prisma.attendanceTransaction.createMany({ data: txData, skipDuplicates: true });

      const dayByEmployee = new Map<string, Set<string>>();
      for (const t of txData) {
        const date = await dayStringFor(device.tenantId, t.employeeId, t.timestamp);
        const set = dayByEmployee.get(t.employeeId) ?? new Set<string>();
        set.add(date);
        dayByEmployee.set(t.employeeId, set);
      }
      for (const [employeeId, dates] of dayByEmployee) {
        for (const date of dates) {
          await recalculateEmployeeDay({ tenantId: device.tenantId, employeeId, date, triggeredBy: `connector:${device.deviceId}` });
        }
      }

      await prisma.device.update({
        where: { id: device.id },
        data: { lastTransactionAt: new Date(), lastSeenAt: new Date() },
      });

      console.log(`[ZK Connector] Synced ${txResult.count} transactions, unresolved: ${data.records.length - txData.length}`);
    } catch (err) {
      console.error('[ZK Connector] Sync error:', err);
    }
  }

  syncOnce();
  syncTimer = setInterval(syncOnce, intervalMs);
}

export function stopZkConnectorSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
    console.log('[ZK Connector] Stopped');
  }
}

async function dayStringFor(tenantId: string, _employeeId: string, ts: Date): Promise<string> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const timezone = tenant?.timezone ?? 'UTC';
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ts);
  } catch {
    return ts.toISOString().slice(0, 10);
  }
}