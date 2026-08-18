import type { FastifyInstance } from 'fastify';
import { AppError, attendanceAdjustmentSchema, manualPunchSchema } from '@attendiq/shared';
import { prisma, Prisma } from '../lib/db.js';
import { writeAudit } from '../plugins/audit.js';
import { requirePermission, requireTenantOfUser, requireUser } from '../plugins/auth.js';
import { parseId, parseListQuery, takeSkip } from '../lib/http.js';
import { recalculateEmployeeDay } from '../modules/attendance.js';

export function registerAttendanceRoutes(app: FastifyInstance): void {
  app.get('/attendance', async (req, reply) => {
    requirePermission('attendance.read')(req);
    const tenantId = requireTenantOfUser(req);
    const q = parseListQuery(req.query);
    const where: Prisma.AttendanceDayWhereInput = { tenantId };
    if (q.from || q.to) {
      where.date = {};
      if (q.from) where.date.gte = new Date(`${q.from}T00:00:00.000Z`);
      if (q.to) where.date.lte = new Date(`${q.to}T23:59:59.999Z`);
    }
    if (q.q) {
      const employees = await prisma.employee.findMany({
        where: { tenantId, OR: [{ firstName: { contains: q.q, mode: 'insensitive' } }, { lastName: { contains: q.q, mode: 'insensitive' } }, { employeeNumber: { contains: q.q, mode: 'insensitive' } }] },
        select: { id: true },
      });
      if (employees.length > 0) where.employeeId = { in: employees.map((e) => e.id) };
      else where.employeeId = { in: [] };
    }
    const [items, total] = await Promise.all([
      prisma.attendanceDay.findMany({
        where,
        include: { employee: { select: { id: true, employeeNumber: true, firstName: true, lastName: true, department: true } } },
        ...takeSkip(q),
        orderBy: { date: 'desc' },
      }),
      prisma.attendanceDay.count({ where }),
    ]);
    reply.send({ data: { items, page: q.page, pageSize: q.pageSize, total } });
  });

  app.get('/attendance/days/:id', async (req, reply) => {
    requirePermission('attendance.read')(req);
    const tenantId = requireTenantOfUser(req);
    const id = parseId(req);
    const day = await prisma.attendanceDay.findFirst({
      where: { id, tenantId },
      include: {
        employee: { select: { id: true, employeeNumber: true, firstName: true, lastName: true } },
        calculations: { orderBy: { calculatedAt: 'desc' }, take: 5 },
        adjustments: true,
      },
    });
    if (!day) throw AppError.notFound('Attendance day not found');
    reply.send({ data: day });
  });

  app.post('/attendance/recalculate', async (req, reply) => {
    requirePermission('attendance.recalculate')(req);
    const tenantId = requireTenantOfUser(req);
    const user = requireUser(req);
    const body = (req.body ?? {}) as { employeeId?: string; date?: string };
    if (!body.employeeId || !body.date) throw AppError.validation('employeeId and date are required');
    const employee = await prisma.employee.findFirst({ where: { id: body.employeeId, tenantId } });
    if (!employee) throw AppError.notFound('Employee not found');
    const result = await recalculateEmployeeDay({ tenantId, employeeId: body.employeeId, date: body.date, triggeredBy: user.userId });
    await writeAudit(req, { action: 'recalculate', resourceType: 'attendance_day', resourceId: result.attendanceDayId, after: { date: body.date, status: result.status } });
    reply.send({ data: result });
  });

  app.post('/attendance/manual-punch', async (req, reply) => {
    requirePermission('attendance.write')(req);
    const tenantId = requireTenantOfUser(req);
    const user = requireUser(req);
    const body = manualPunchSchema.parse(req.body);
    const employee = await prisma.employee.findFirst({ where: { id: body.employeeId, tenantId } });
    if (!employee) throw AppError.notFound('Employee not found');

    const ts = new Date(body.timestamp);
    const transaction = await prisma.attendanceTransaction.create({
      data: {
        tenantId,
        dedupeKey: `manual:${user.userId}:${body.employeeId}:${body.timestamp}`,
        source: 'MANUAL',
        employeeId: body.employeeId,
        deviceUserId: employee.deviceUserId ?? body.employeeId,
        timestamp: ts,
        punchType: body.type,
        payload: { reason: body.reason },
        status: 'PROCESSED',
      },
    });

    const timezone = (await prisma.tenant.findUnique({ where: { id: tenantId } }))?.timezone ?? 'UTC';
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ts);
    await recalculateEmployeeDay({ tenantId, employeeId: body.employeeId, date, triggeredBy: user.userId });
    await writeAudit(req, { action: 'manual_punch', resourceType: 'attendance_transaction', resourceId: transaction.id });
    reply.code(201).send({ data: transaction });
  });

  app.get('/attendance/transactions', async (req, reply) => {
    requirePermission('attendance.read')(req);
    const tenantId = requireTenantOfUser(req);
    const q = parseListQuery(req.query);
    const where: Prisma.AttendanceTransactionWhereInput = { tenantId };
    if (q.from || q.to) {
      where.timestamp = {};
      if (q.from) where.timestamp.gte = new Date(`${q.from}T00:00:00.000Z`);
      if (q.to) where.timestamp.lte = new Date(`${q.to}T23:59:59.999Z`);
    }
    const [items, total] = await Promise.all([
      prisma.attendanceTransaction.findMany({ where, ...takeSkip(q), orderBy: { timestamp: 'desc' } }),
      prisma.attendanceTransaction.count({ where }),
    ]);
    reply.send({ data: { items, page: q.page, pageSize: q.pageSize, total } });
  });

  // --- Adjustments ---
  app.post('/attendance/adjustments', async (req, reply) => {
    requirePermission('attendance.correction')(req);
    const tenantId = requireTenantOfUser(req);
    const user = requireUser(req);
    const body = attendanceAdjustmentSchema.parse(req.body);
    const day = await prisma.attendanceDay.findFirst({ where: { id: body.attendanceDayId, tenantId } });
    if (!day) throw AppError.notFound('Attendance day not found');
    const adjustment = await prisma.attendanceAdjustment.create({
      data: {
        tenantId,
        attendanceDayId: day.id,
        checkIn: body.checkIn ? new Date(body.checkIn) : undefined,
        checkOut: body.checkOut ? new Date(body.checkOut) : undefined,
        note: body.note,
        reason: body.reason,
        submittedBy: user.userId,
      },
    });
    await writeAudit(req, { action: 'create', resourceType: 'attendance_adjustment', resourceId: adjustment.id });
    reply.code(201).send({ data: adjustment });
  });

  app.post('/attendance/adjustments/:id/decide', async (req, reply) => {
    requirePermission('attendance.approve')(req);
    const tenantId = requireTenantOfUser(req);
    const user = requireUser(req);
    const id = parseId(req);
    const body = (req.body ?? {}) as { decision?: 'APPROVED' | 'REJECTED'; note?: string };
    if (!body.decision || !['APPROVED', 'REJECTED'].includes(body.decision)) {
      throw AppError.validation('decision must be APPROVED or REJECTED');
    }
    const adjustment = await prisma.attendanceAdjustment.findFirst({ where: { id, tenantId } });
    if (!adjustment) throw AppError.notFound('Adjustment not found');
    const updated = await prisma.attendanceAdjustment.update({
      where: { id },
      data: { status: body.decision, reviewedBy: user.userId, reviewedAt: new Date() },
    });
    await prisma.attendanceApproval.create({
      data: {
        tenantId,
        adjustmentId: id,
        status: body.decision,
        approvedBy: user.userId,
        note: body.note,
      },
    });
    if (body.decision === 'APPROVED') {
      const day = await prisma.attendanceDay.findUnique({ where: { id: adjustment.attendanceDayId } });
      if (day) {
        await recalculateEmployeeDay({ tenantId, employeeId: day.employeeId, date: toDateString(day.date), triggeredBy: user.userId });
      }
    }
    await writeAudit(req, { action: 'decide', resourceType: 'attendance_adjustment', resourceId: id, after: { decision: body.decision } });
    reply.send({ data: updated });
  });
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}