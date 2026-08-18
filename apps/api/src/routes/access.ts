import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError, accessGroupSchema, doorSchema } from '@attendiq/shared';
import { prisma, Prisma } from '../lib/db.js';
import { writeAudit } from '../plugins/audit.js';
import { requirePermission, requireTenantOfUser } from '../plugins/auth.js';
import { parseId, parseListQuery, takeSkip } from '../lib/http.js';

const accessDeviceSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(['READER', 'PERSONNEL', 'GATE', 'TURNTILE', 'ELEVATOR']).default('READER'),
  deviceId: z.string().optional(),
});

const assignmentSchema = z.object({
  groupId: z.string().min(1),
  employeeId: z.string().min(1),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

const wasSchema = z.object({
  name: z.string().min(1).max(255),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  days: z.array(z.number().int().min(0).max(6)).default([0, 1, 2, 3, 4, 5, 6]),
  groupId: z.string().optional(),
});

export function registerAccessRoutes(app: FastifyInstance): void {
  // --- Access devices ---
  app.get('/access/devices', async (req, reply) => {
    requirePermission('access.read')(req);
    const tenantId = requireTenantOfUser(req);
    const devices = await prisma.accessDevice.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
    reply.send({ data: devices });
  });

  app.post('/access/devices', async (req, reply) => {
    requirePermission('access.write')(req);
    const tenantId = requireTenantOfUser(req);
    const body = accessDeviceSchema.parse(req.body);
    const row = await prisma.accessDevice.create({ data: { ...body, tenantId } });
    await writeAudit(req, { action: 'create', resourceType: 'access_device', resourceId: row.id });
    reply.code(201).send({ data: row });
  });

  // --- Doors ---
  app.get('/access/doors', async (req, reply) => {
    requirePermission('access.read')(req);
    const tenantId = requireTenantOfUser(req);
    const q = parseListQuery(req.query);
    const [items, total] = await Promise.all([
      prisma.door.findMany({ where: { tenantId }, include: { branch: true }, ...takeSkip(q), orderBy: { name: 'asc' } }),
      prisma.door.count({ where: { tenantId } }),
    ]);
    reply.send({ data: { items, page: q.page, pageSize: q.pageSize, total } });
  });

  app.post('/access/doors', async (req, reply) => {
    requirePermission('access.write')(req);
    const tenantId = requireTenantOfUser(req);
    const body = doorSchema.parse(req.body);
    const row = await prisma.door.create({ data: { ...body, tenantId } });
    await writeAudit(req, { action: 'create', resourceType: 'door', resourceId: row.id });
    reply.code(201).send({ data: row });
  });

  app.put('/access/doors/:id', async (req, reply) => {
    requirePermission('access.write')(req);
    const tenantId = requireTenantOfUser(req);
    const id = parseId(req);
    const existing = await prisma.door.findFirst({ where: { id, tenantId } });
    if (!existing) throw AppError.notFound('Door not found');
    const body = doorSchema.partial().parse(req.body);
    const updated = await prisma.door.update({ where: { id }, data: body });
    await writeAudit(req, { action: 'update', resourceType: 'door', resourceId: id });
    reply.send({ data: updated });
  });

  app.delete('/access/doors/:id', async (req, reply) => {
    requirePermission('access.write')(req);
    const tenantId = requireTenantOfUser(req);
    const id = parseId(req);
    const existing = await prisma.door.findFirst({ where: { id, tenantId } });
    if (!existing) throw AppError.notFound('Door not found');
    await prisma.door.delete({ where: { id } });
    await writeAudit(req, { action: 'delete', resourceType: 'door', resourceId: id });
    reply.code(204).send();
  });

  // --- Access groups ---
  app.get('/access/groups', async (req, reply) => {
    requirePermission('access.read')(req);
    const tenantId = requireTenantOfUser(req);
    const groups = await prisma.accessGroup.findMany({
      where: { tenantId },
      include: { doors: { include: { door: true } }, schedules: true, assignments: { include: { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } } } } },
      orderBy: { name: 'asc' },
    });
    reply.send({ data: groups });
  });

  app.post('/access/groups', async (req, reply) => {
    requirePermission('access.write')(req);
    const tenantId = requireTenantOfUser(req);
    const body = accessGroupSchema.parse(req.body);
    const group = await prisma.accessGroup.create({
      data: {
        tenantId,
        name: body.name,
        doors: { create: body.doorIds.map((doorId) => ({ doorId })) },
      },
      include: { doors: true },
    });
    await writeAudit(req, { action: 'create', resourceType: 'access_group', resourceId: group.id });
    reply.code(201).send({ data: group });
  });

  app.put('/access/groups/:id', async (req, reply) => {
    requirePermission('access.write')(req);
    const tenantId = requireTenantOfUser(req);
    const id = parseId(req);
    const existing = await prisma.accessGroup.findFirst({ where: { id, tenantId } });
    if (!existing) throw AppError.notFound('Access group not found');
    const body = accessGroupSchema.partial().parse(req.body);
    const data: Record<string, unknown> = {};
    if (body.name) data.name = body.name;
    if (body.doorIds) {
      data.doors = { deleteMany: {}, create: body.doorIds.map((doorId) => ({ doorId })) };
    }
    const updated = await prisma.accessGroup.update({ where: { id }, data: data as never, include: { doors: true } });
    await writeAudit(req, { action: 'update', resourceType: 'access_group', resourceId: id });
    reply.send({ data: updated });
  });

  app.delete('/access/groups/:id', async (req, reply) => {
    requirePermission('access.write')(req);
    const tenantId = requireTenantOfUser(req);
    const id = parseId(req);
    const existing = await prisma.accessGroup.findFirst({ where: { id, tenantId } });
    if (!existing) throw AppError.notFound('Access group not found');
    await prisma.accessGroup.delete({ where: { id } });
    await writeAudit(req, { action: 'delete', resourceType: 'access_group', resourceId: id });
    reply.code(204).send();
  });

  // --- Placements / schedules ---
  app.post('/access/assignments', async (req, reply) => {
    requirePermission('access.write')(req);
    const tenantId = requireTenantOfUser(req);
    const body = assignmentSchema.parse(req.body);
    const employee = await prisma.employee.findFirst({ where: { id: body.employeeId, tenantId } });
    if (!employee) throw AppError.notFound('Employee not found');
    const row = await prisma.accessAssignment.create({
      data: {
        tenantId,
        groupId: body.groupId,
        employeeId: body.employeeId,
        effectiveFrom: new Date(`${body.effectiveFrom}T00:00:00.000Z`),
        effectiveTo: body.effectiveTo ? new Date(`${body.effectiveTo}T00:00:00.000Z`) : null,
      },
    });
    await writeAudit(req, { action: 'create', resourceType: 'access_assignment', resourceId: row.id });
    reply.code(201).send({ data: row });
  });

  app.get('/access/schedules', async (req, reply) => {
    requirePermission('access.read')(req);
    const tenantId = requireTenantOfUser(req);
    const schedules = await prisma.accessSchedule.findMany({ where: { tenantId }, include: { group: true } });
    reply.send({ data: schedules });
  });

  app.post('/access/schedules', async (req, reply) => {
    requirePermission('access.write')(req);
    const tenantId = requireTenantOfUser(req);
    const body = wasSchema.parse(req.body);
    const row = await prisma.accessSchedule.create({ data: { ...body, tenantId, days: body.days as never } });
    await writeAudit(req, { action: 'create', resourceType: 'access_schedule', resourceId: row.id });
    reply.code(201).send({ data: row });
  });

  // --- Events ---
  app.get('/access/events', async (req, reply) => {
    requirePermission('access.read')(req);
    const tenantId = requireTenantOfUser(req);
    const q = parseListQuery(req.query);
    const where: Prisma.AccessEventWhereInput = { tenantId };
    if (q.from || q.to) {
      where.timestamp = {};
      if (q.from) where.timestamp.gte = new Date(`${q.from}T00:00:00.000Z`);
      if (q.to) where.timestamp.lte = new Date(`${q.to}T23:59:59.999Z`);
    }
    const [items, total] = await Promise.all([
      prisma.accessEvent.findMany({ where, include: { door: true }, ...takeSkip(q), orderBy: { timestamp: 'desc' } }),
      prisma.accessEvent.count({ where }),
    ]);
    reply.send({ data: { items, page: q.page, pageSize: q.pageSize, total } });
  });
}