import type { FastifyInstance } from 'fastify';
import { prisma, Prisma } from '../lib/db.js';
import { requirePermission, requireTenantOfUser } from '../plugins/auth.js';
import { parseListQuery, takeSkip } from '../lib/http.js';

export function registerAuditRoutes(app: FastifyInstance): void {
  app.get('/audit', async (req, reply) => {
    requirePermission('audit.read')(req);
    const tenantId = requireTenantOfUser(req);
    const q = parseListQuery(req.query);
    const where: Prisma.AuditEventWhereInput = { tenantId };
    const filters = (req.query ?? {}) as { action?: string; resourceType?: string; actorId?: string; from?: string; to?: string };
    if (filters.action) where.action = filters.action;
    if (filters.resourceType) where.resourceType = filters.resourceType;
    if (filters.actorId) where.actorId = filters.actorId;
    if (filters.from || filters.to) {
      where.occurredAt = {};
      if (filters.from) where.occurredAt.gte = new Date(`${filters.from}T00:00:00.000Z`);
      if (filters.to) where.occurredAt.lte = new Date(`${filters.to}T23:59:59.999Z`);
    }

    const [items, total] = await Promise.all([
      prisma.auditEvent.findMany({
        where,
        include: { user: { select: { id: true, email: true } } },
        ...takeSkip(q),
        orderBy: { occurredAt: 'desc' },
      }),
      prisma.auditEvent.count({ where }),
    ]);
    reply.send({ data: { items, page: q.page, pageSize: q.pageSize, total } });
  });
}