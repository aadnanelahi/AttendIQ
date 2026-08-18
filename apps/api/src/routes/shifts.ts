import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError, holidaySchema, shiftSchema } from '@attendiq/shared';
import { prisma, Prisma } from '../lib/db.js';
import { registerCrud } from '../lib/crud.js';
import { writeAudit } from '../plugins/audit.js';
import { requirePermission, requireTenantOfUser } from '../plugins/auth.js';
import { parseId, parseListQuery, takeSkip } from '../lib/http.js';

const employeeScheduleSchema = z.object({
  employeeId: z.string().min(1),
  shiftId: z.string().min(1),
  scheduleId: z.string().optional(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

const rosterSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  branchId: z.string().optional(),
  shiftId: z.string().optional(),
  entries: z.unknown().optional(),
});

export function registerShiftRoutes(app: FastifyInstance): void {
  registerCrud(app, '/shifts', {
    delegate: prisma.shift,
    createSchema: shiftSchema,
    resource: 'shift',
    permissionWrite: 'shift.write',
    permissionRead: 'shift.read',
    searchFields: ['name'],
  });

  registerCrud(app, '/holidays', {
    delegate: prisma.holiday,
    createSchema: holidaySchema,
    resource: 'holiday',
    permissionWrite: 'holiday.write',
    permissionRead: 'holiday.read',
    searchFields: ['name'],
    orderBy: { date: 'desc' },
    beforeCreate: (data) => ({ ...data, date: new Date(`${String(data.date)}T00:00:00.000Z`) }),
    beforeUpdate: (data) => ({ ...data, date: new Date(`${String(data.date)}T00:00:00.000Z`) }),
  });

  app.get('/schedules', async (req, reply) => {
    requirePermission('roster.read')(req);
    const tenantId = requireTenantOfUser(req);
    const schedules = await prisma.schedule.findMany({
      where: { tenantId },
      include: { shift: true },
      orderBy: { name: 'asc' },
    });
    reply.send({ data: schedules });
  });

  app.post('/schedules', async (req, reply) => {
    requirePermission('roster.write')(req);
    const tenantId = requireTenantOfUser(req);
    const body = (req.body ?? {}) as { name?: string; shiftId?: string; isTemporary?: boolean };
    if (!body.name) throw AppError.validation('name is required');
    const schedule = await prisma.schedule.create({
      data: { tenantId, name: body.name, shiftId: body.shiftId, isTemporary: body.isTemporary ?? false },
    });
    await writeAudit(req, { action: 'create', resourceType: 'schedule', resourceId: schedule.id });
    reply.code(201).send({ data: schedule });
  });

  // --- Employee schedules (effective-dated) ---
  app.get('/employee-schedules', async (req, reply) => {
    requirePermission('roster.read')(req);
    const tenantId = requireTenantOfUser(req);
    const q = parseListQuery(req.query);
    const where: Record<string, unknown> = { tenantId };
    if (q.q) {
      const employees = await prisma.employee.findMany({
        where: { tenantId, OR: [{ firstName: { contains: q.q, mode: 'insensitive' } }, { lastName: { contains: q.q, mode: 'insensitive' } }] },
        select: { id: true },
      });
      where.employeeId = { in: employees.map((e) => e.id) };
    }
    const items = await prisma.employeeSchedule.findMany({
      where,
      include: { employee: { select: { id: true, employeeNumber: true, firstName: true, lastName: true } }, shift: true, schedule: true },
      ...takeSkip(q),
      orderBy: { effectiveFrom: 'desc' },
    });
    reply.send({ data: { items } });
  });

  app.post('/employee-schedules', async (req, reply) => {
    requirePermission('roster.write')(req);
    const tenantId = requireTenantOfUser(req);
    const body = employeeScheduleSchema.parse(req.body);
    const employee = await prisma.employee.findFirst({ where: { id: body.employeeId, tenantId } });
    if (!employee) throw AppError.notFound('Employee not found');
    const shift = await prisma.shift.findFirst({ where: { id: body.shiftId, tenantId } });
    if (!shift) throw AppError.notFound('Shift not found');
    const schedule = await prisma.employeeSchedule.create({
      data: {
        tenantId,
        employeeId: body.employeeId,
        shiftId: body.shiftId,
        scheduleId: body.scheduleId,
        effectiveFrom: new Date(`${body.effectiveFrom}T00:00:00.000Z`),
        effectiveTo: body.effectiveTo ? new Date(`${body.effectiveTo}T00:00:00.000Z`) : null,
      },
    });
    await writeAudit(req, { action: 'create', resourceType: 'employee_schedule', resourceId: schedule.id });
    reply.code(201).send({ data: schedule });
  });

  app.delete('/employee-schedules/:id', async (req, reply) => {
    requirePermission('roster.write')(req);
    const tenantId = requireTenantOfUser(req);
    const id = parseId(req);
    const existing = await prisma.employeeSchedule.findFirst({ where: { id, tenantId } });
    if (!existing) throw AppError.notFound('Employee schedule not found');
    await prisma.employeeSchedule.delete({ where: { id } });
    await writeAudit(req, { action: 'delete', resourceType: 'employee_schedule', resourceId: id });
    reply.code(204).send();
  });

  // --- Rosters ---
  app.get('/rosters', async (req, reply) => {
    requirePermission('roster.read')(req);
    const tenantId = requireTenantOfUser(req);
    const q = parseListQuery(req.query);
    const where: Prisma.RosterWhereInput = { tenantId };
    if (q.from || q.to) {
      where.date = {};
      if (q.from) where.date.gte = new Date(`${q.from}T00:00:00.000Z`);
      if (q.to) where.date.lte = new Date(`${q.to}T23:59:59.999Z`);
    }
    const [items, total] = await Promise.all([
      prisma.roster.findMany({ where, include: { shift: true, schedule: true }, ...takeSkip(q), orderBy: { date: 'desc' } }),
      prisma.roster.count({ where }),
    ]);
    reply.send({ data: { items, page: q.page, pageSize: q.pageSize, total } });
  });

  app.post('/rosters', async (req, reply) => {
    requirePermission('roster.write')(req);
    const tenantId = requireTenantOfUser(req);
    const body = rosterSchema.parse(req.body);
    const roster = await prisma.roster.create({
      data: {
        tenantId,
        date: new Date(`${body.date}T00:00:00.000Z`),
        branchId: body.branchId,
        shiftId: body.shiftId,
        entries: body.entries as object | undefined,
      },
    });
    await writeAudit(req, { action: 'create', resourceType: 'roster', resourceId: roster.id });
    reply.code(201).send({ data: roster });
  });
}