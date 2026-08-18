import { prisma } from '../lib/db.js';
import { calculateAttendanceDay, localMidnightUtcMs } from '@attendiq/core';
import type { AttendanceDayInput } from '@attendiq/core';

export const RULE_VERSION = 'attendance-engine-v1';

function dateStart(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

function dateEnd(dateStr: string): Date {
  return new Date(`${dateStr}T23:59:59.999Z`);
}

async function timezoneForEmployee(tenantId: string, employeeId: string): Promise<string> {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, tenantId },
    include: { branch: { select: { timezone: true } } },
  });
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  return employee?.branch?.timezone ?? tenant?.timezone ?? 'UTC';
}

export async function resolveShiftForDay(employeeId: string, date: string): Promise<{ id: string; shiftId: string } | null> {
  const day = dateStart(date);
  const schedule = await prisma.employeeSchedule.findFirst({
    where: {
      employeeId,
      effectiveFrom: { lte: day },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: day } }],
    },
    include: { shift: true },
    orderBy: { effectiveFrom: 'desc' },
  });
  if (schedule?.shiftId && schedule.shift) {
    return { id: schedule.id, shiftId: schedule.shiftId };
  }
  return null;
}

export async function recalculateEmployeeDay(opts: {
  tenantId: string;
  employeeId: string;
  date: string;
  triggeredBy?: string | null;
}): Promise<{ attendanceDayId: string; status: string; recalculated: boolean }> {
  const { tenantId, employeeId, date, triggeredBy } = opts;
  const timezone = await timezoneForEmployee(tenantId, employeeId);
  const dayStartMs = localMidnightUtcMs(date, timezone);

  const shiftRef = await resolveShiftForDay(employeeId, date);
  const shift = shiftRef
    ? await prisma.shift.findUnique({ where: { id: shiftRef.shiftId } })
    : null;

  const from = dayStartMs - 12 * 3600_000;
  const to = dayStartMs + 36 * 3600_000;
  const transactions = await prisma.attendanceTransaction.findMany({
    where: { tenantId, employeeId, timestamp: { gte: new Date(from), lte: new Date(to) } },
    orderBy: { timestamp: 'asc' },
  });

  const holiday = await prisma.holiday.findFirst({ where: { tenantId, date: { gte: dateStart(date), lte: dateEnd(date) } } });
  const leave = await prisma.leaveRequest.findFirst({
    where: { tenantId, employeeId, status: 'APPROVED', from: { lte: dateEnd(date) }, to: { gte: dateStart(date) } },
  });

  const input: AttendanceDayInput = {
    dayStartMs,
    shift: shift
      ? {
          startTime: shift.startTime,
          endTime: shift.endTime,
          crossesMidnight: shift.crossesMidnight,
          graceInMinutes: shift.graceInMinutes,
          graceOutMinutes: shift.graceOutMinutes,
          breakMinutes: shift.breakMinutes,
          lateAllowedMinutes: shift.lateAllowedMinutes,
          earlyLeaveAllowedMinutes: shift.earlyLeaveAllowedMinutes,
          requiredHoursMinutes: shift.requiredHoursMinutes ?? undefined,
          isFlexible: shift.isFlexible,
        }
      : null,
    punches: transactions.map((t) => t.timestamp.getTime()),
    isHoliday: Boolean(holiday),
    isLeave: Boolean(leave),
    isRestDay: shift?.restDay ?? false,
  };

  const result = calculateAttendanceDay(input);

  const attendanceDay = await prisma.attendanceDay.upsert({
    where: { tenantId_employeeId_date: { tenantId, employeeId, date: dateStart(date) } },
    update: {
      status: result.status,
      checkIn: result.checkIn ? new Date(result.checkIn) : null,
      checkOut: result.checkOut ? new Date(result.checkOut) : null,
      workMinutes: result.workMinutes,
      requiredMinutes: result.requiredMinutes,
      lateMinutes: result.lateMinutes,
      earlyLeaveMinutes: result.earlyLeaveMinutes,
      overtimeMinutes: result.overtimeMinutes,
      breaksMinutes: result.breaksMinutes,
      shiftId: shiftRef?.shiftId ?? null,
      scheduleId: shiftRef?.id ?? null,
      exceptions: result.exceptions as never,
      ruleVersion: RULE_VERSION,
      calculatedAt: new Date(),
    },
    create: {
      tenantId,
      employeeId,
      date: dateStart(date),
      status: result.status,
      checkIn: result.checkIn ? new Date(result.checkIn) : null,
      checkOut: result.checkOut ? new Date(result.checkOut) : null,
      workMinutes: result.workMinutes,
      requiredMinutes: result.requiredMinutes,
      lateMinutes: result.lateMinutes,
      earlyLeaveMinutes: result.earlyLeaveMinutes,
      overtimeMinutes: result.overtimeMinutes,
      breaksMinutes: result.breaksMinutes,
      shiftId: shiftRef?.shiftId ?? null,
      scheduleId: shiftRef?.id ?? null,
      exceptions: result.exceptions as never,
      ruleVersion: RULE_VERSION,
      calculatedAt: new Date(),
    },
  });

  await prisma.attendanceCalculation.create({
    data: {
      tenantId,
      attendanceDayId: attendanceDay.id,
      ruleVersion: RULE_VERSION,
      inputSnapshot: { dayStartMs, shift, holiday: Boolean(holiday), leave: Boolean(leave), transactions: transactions.length } as never,
      output: result as never,
      triggeredBy: triggeredBy ?? null,
    },
  });

  return { attendanceDayId: attendanceDay.id, status: result.status, recalculated: true };
}