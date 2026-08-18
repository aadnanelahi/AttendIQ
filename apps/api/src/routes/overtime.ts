import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '@attendiq/shared';
import { prisma, Prisma } from '../lib/db.js';
import { writeAudit } from '../plugins/audit.js';
import { requirePermission, requireTenantOfUser, requireUser } from '../plugins/auth.js';
import { parseId, parseListQuery, takeSkip } from '../lib/http.js';

const overtimeSchema = z.object({
  employeeId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(['OVERTIME', 'PRE_OT', 'POST_OT', 'HOLIDAY_OT', 'REST_DAY_OT']).default('OVERTIME'),
  minutes: z.coerce.number().int().min(1).max(1440),
  multiplier: z.coerce.number().min(1).max(3).default(1),
  note: z.string().max(1000).optional(),
});

export function registerOvertimeRoutes(app: FastifyInstance): void {
  app.get('/overtime', async (req, reply) => {
    requirePermission('overtime.read')(req);
    const tenantId = requireTenantOfUser(req);
    const q = parseListQuery(req.query);
    const where: Prisma.OvertimeWhereInput = { tenantId };
    if (q.from || q.to) {
      where.date = {};
      if (q.from) where.date.gte = new Date(`${q.from}T00:00:00.000Z`);
      if (q.to) where.date.lte = new Date(`${q.to}T23:59:59.999Z`);
    }
    const [items, total] = await Promise.all([
      prisma.overtime.findMany({
        where,
        include: { employee: { select: { id: true, employeeNumber: true, firstName: true, lastName: true } } },
        ...takeSkip(q),
        orderBy: { date: 'desc' },
      }),
      prisma.overtime.count({ where }),
    ]);
    reply.send({ data: { items, page: q.page, pageSize: q.pageSize, total } });
  });

  app.post('/overtime', async (req, reply) => {
    requirePermission('overtime.write')(req);
    const tenantId = requireTenantOfUser(req);
    const body = overtimeSchema.parse(req.body);
    const employee = await prisma.employee.findFirst({ where: { id: body.employeeId, tenantId } });
    if (!employee) throw AppError.notFound('Employee not found');
    const row = await prisma.overtime.create({
      data: {
        tenantId,
        employeeId: body.employeeId,
        date: new Date(`${body.date}T00:00:00.000Z`),
        type: body.type,
        minutes: body.minutes,
        multiplier: body.multiplier,
        note: body.note,
      },
    });
    await writeAudit(req, { action: 'create', resourceType: 'overtime', resourceId: row.id });
    reply.code(201).send({ data: row });
  });

  app.post('/overtime/:id/decide', async (req, reply) => {
    requirePermission('overtime.approve')(req);
    const tenantId = requireTenantOfUser(req);
    const user = requireUser(req);
    const id = parseId(req);
    const body = (req.body ?? {}) as { decision?: 'APPROVED' | 'REJECTED'; note?: string };
    if (!body.decision || !['APPROVED', 'REJECTED'].includes(body.decision)) {
      throw AppError.validation('decision must be APPROVED or REJECTED');
    }
    const existing = await prisma.overtime.findFirst({ where: { id, tenantId } });
    if (!existing) throw AppError.notFound('Overtime record not found');
    const updated = await prisma.overtime.update({
      where: { id },
      data: { status: body.decision, approvedBy: user.userId, approvedAt: new Date() },
    });
    await writeAudit(req, { action: 'decide', resourceType: 'overtime', resourceId: id, after: { decision: body.decision } });
    reply.send({ data: updated });
  });
}