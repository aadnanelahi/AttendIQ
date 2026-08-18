import type { FastifyInstance } from 'fastify';
import { AppError, deviceIngestSchema } from '@attendiq/shared';
import { prisma } from '../lib/db.js';
import { authDeviceOf } from '../plugins/auth.js';
import { recalculateEmployeeDay } from '../modules/attendance.js';

export function registerDeviceGateway(app: FastifyInstance): void {
  app.post('/device-gateway/transactions', async (req, reply) => {
    const deviceCtx = authDeviceOf(req);
    const body = deviceIngestSchema.parse(req.body);

    const device = await prisma.device.findUnique({ where: { id: deviceCtx.deviceId } });
    if (!device || device.tenantId !== deviceCtx.tenantId) throw AppError.auth('Device not found');
    if (device.deviceId !== body.deviceId) {
      throw AppError.validation('deviceId does not match the authenticated device');
    }

    const userKeys = [...new Set(body.transactions.map((t) => t.userId))];
    const employees = await prisma.employee.findMany({
      where: { tenantId: device.tenantId, deviceUserId: { in: userKeys } },
      select: { id: true, deviceUserId: true },
    });
    const byDeviceUser = new Map(employees.map((e) => [e.deviceUserId, e.id]));

    const events = body.transactions.map((t) => ({
      tenantId: device.tenantId,
      deviceId: device.id,
      dedupeKey: `evt:${device.deviceId}:${t.userId}:${t.timestamp}`,
      raw: t.raw ?? { userId: t.userId, timestamp: t.timestamp, type: t.type },
      status: 'PROCESSED' as const,
    }));
    const eventResult = await prisma.deviceEvent.createMany({ data: events, skipDuplicates: true });

    const txData = body.transactions
      .filter((t) => byDeviceUser.has(t.userId))
      .map((t) => ({
        tenantId: device.tenantId,
        dedupeKey: `tx:${device.deviceId}:${t.userId}:${t.timestamp}`,
        source: 'DEVICE' as const,
        deviceId: device.id,
        employeeId: byDeviceUser.get(t.userId)!,
        deviceUserId: t.userId,
        timestamp: new Date(t.timestamp),
        punchType: t.type,
        payload: t.raw as object | undefined,
        status: 'PROCESSED' as const,
      }));
    const txResult = await prisma.attendanceTransaction.createMany({ data: txData, skipDuplicates: true });

    const unresolved = body.transactions.length - txData.length;

    // Recalculate one attendance day per unique (employee, date) pair.
    const dayByEmployee = new Map<string, Set<string>>();
    for (const t of txData) {
      const date = await dayStringFor(device.tenantId, t.employeeId, t.timestamp);
      const set = dayByEmployee.get(t.employeeId) ?? new Set<string>();
      set.add(date);
      dayByEmployee.set(t.employeeId, set);
    }
    let recalculated = 0;
    for (const [employeeId, dates] of dayByEmployee) {
      for (const date of dates) {
        await recalculateEmployeeDay({ tenantId: device.tenantId, employeeId, date, triggeredBy: `device:${device.deviceId}` });
        recalculated++;
      }
    }

    await prisma.device.update({
      where: { id: device.id },
      data: { lastTransactionAt: new Date(), lastSeenAt: new Date() },
    });

    reply.send({
      data: {
        accepted: txResult.count,
        unresolvedEmployees: unresolved,
        rawEventsWritten: eventResult.count,
        recalculatedDays: recalculated,
      },
    });
  });
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