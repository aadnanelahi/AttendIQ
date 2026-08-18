import type { FastifyInstance } from 'fastify';
import { AppError, visitSchema, visitorSchema } from '@attendiq/shared';
import { prisma } from '../lib/db.js';
import { writeAudit } from '../plugins/audit.js';
import { requirePermission, requireTenantOfUser, requireUser } from '../plugins/auth.js';
import { parseId, parseListQuery, takeSkip } from '../lib/http.js';
import { generateOpaqueToken } from '../lib/hashing.js';

const BADGE_BYTES = 8;

export function registerVisitorRoutes(app: FastifyInstance): void {
  app.get('/visitors', async (req, reply) => {
    requirePermission('visitor.read')(req);
    const tenantId = requireTenantOfUser(req);
    const q = parseListQuery(req.query);
    const where: Record<string, unknown> = { tenantId };
    if (q.q) {
      where.OR = [{ fullName: { contains: q.q, mode: 'insensitive' } }, { idNumber: { contains: q.q, mode: 'insensitive' } }, { phone: { contains: q.q } }];
    }
    const [items, total] = await Promise.all([
      prisma.visitor.findMany({ where, ...takeSkip(q), orderBy: { id: 'desc' } }),
      prisma.visitor.count({ where }),
    ]);
    reply.send({ data: { items, page: q.page, pageSize: q.pageSize, total } });
  });

  app.post('/visitors', async (req, reply) => {
    requirePermission('visitor.write')(req);
    const tenantId = requireTenantOfUser(req);
    const body = visitorSchema.parse(req.body);
    const visitor = await prisma.visitor.create({ data: { ...body, tenantId } });
    await writeAudit(req, { action: 'create', resourceType: 'visitor', resourceId: visitor.id });
    reply.code(201).send({ data: visitor });
  });

  app.put('/visitors/:id', async (req, reply) => {
    requirePermission('visitor.write')(req);
    const tenantId = requireTenantOfUser(req);
    const id = parseId(req);
    const existing = await prisma.visitor.findFirst({ where: { id, tenantId } });
    if (!existing) throw AppError.notFound('Visitor not found');
    const body = visitorSchema.partial().parse(req.body);
    const updated = await prisma.visitor.update({ where: { id }, data: body });
    await writeAudit(req, { action: 'update', resourceType: 'visitor', resourceId: id });
    reply.send({ data: updated });
  });

  // --- Visits ---
  app.get('/visits', async (req, reply) => {
    requirePermission('visitor.read')(req);
    const tenantId = requireTenantOfUser(req);
    const q = parseListQuery(req.query);
    const [items, total] = await Promise.all([
      prisma.visit.findMany({
        where: { tenantId },
        include: { visitor: true, checkins: true },
        ...takeSkip(q),
        orderBy: { scheduledAt: 'desc' },
      }),
      prisma.visit.count({ where: { tenantId } }),
    ]);
    reply.send({ data: { items, page: q.page, pageSize: q.pageSize, total } });
  });

  app.post('/visits', async (req, reply) => {
    requirePermission('visitor.write')(req);
    const tenantId = requireTenantOfUser(req);
    const body = visitSchema.parse(req.body);
    const visitor = await prisma.visitor.findFirst({ where: { id: body.visitorId, tenantId } });
    if (!visitor) throw AppError.notFound('Visitor not found');
    const visit = await prisma.visit.create({
      data: {
        tenantId,
        visitorId: body.visitorId,
        hostId: body.hostId,
        purpose: body.purpose,
        scheduledAt: new Date(body.scheduledAt),
      },
    });
    await writeAudit(req, { action: 'create', resourceType: 'visit', resourceId: visit.id });
    reply.code(201).send({ data: visit });
  });

  app.post('/visits/:id/checkin', async (req, reply) => {
    requirePermission('visitor.write')(req);
    const tenantId = requireTenantOfUser(req);
    const user = requireUser(req);
    const id = parseId(req);
    const visit = await prisma.visit.findFirst({ where: { id, tenantId } });
    if (!visit) throw AppError.notFound('Visit not found');
    const badge = generateOpaqueToken().slice(0, BADGE_BYTES * 2);
    const [checkin] = await prisma.$transaction([
      prisma.visitorCheckin.create({
        data: { tenantId, visitId: id, checkInAt: new Date(), verifiedBy: user.userId, method: 'BADGE' },
      }),
      prisma.visit.update({ where: { id }, data: { status: 'CHECKED_IN', badgeNumber: badge } }),
    ]);
    await writeAudit(req, { action: 'checkin', resourceType: 'visit', resourceId: id });
    reply.code(201).send({ data: { ...checkin, badgeNumber: badge } });
  });

  app.post('/visits/:id/checkout', async (req, reply) => {
    requirePermission('visitor.write')(req);
    const tenantId = requireTenantOfUser(req);
    const id = parseId(req);
    const visit = await prisma.visit.findFirst({ where: { id, tenantId } });
    if (!visit) throw AppError.notFound('Visit not found');
    const latest = await prisma.visitorCheckin.findFirst({ where: { tenantId, visitId: id, checkOutAt: null }, orderBy: { checkInAt: 'desc' } });
    if (!latest) throw AppError.conflict('Visit has no open check-in to close');
    const [checkin] = await prisma.$transaction([
      prisma.visitorCheckin.update({ where: { id: latest.id }, data: { checkOutAt: new Date() } }),
      prisma.visit.update({ where: { id }, data: { status: 'CHECKED_OUT' } }),
    ]);
    await writeAudit(req, { action: 'checkout', resourceType: 'visit', resourceId: id });
    reply.send({ data: checkin });
  });
}