import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '@attendiq/shared';
import { prisma } from '../lib/db.js';
import { hashPassword } from '../lib/hashing.js';
import { requirePermission, requireTenantOfUser } from '../plugins/auth.js';
import { ensureTenantRoles } from '../modules/roles.js';
import { writeAudit } from '../plugins/audit.js';
import { parseListQuery, takeSkip } from '../lib/http.js';

const createTenantSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(2).max(64).regex(/^[a-z0-9-]+$/),
  locale: z.enum(['en', 'ar']).default('en'),
  timezone: z.string().default('UTC'),
  adminEmail: z.string().email(),
  adminName: z.string().min(1).max(255),
  adminPassword: z.string().min(8).max(128),
});

export function registerTenantRoutes(app: FastifyInstance): void {
  app.get('/tenants', async (req, reply) => {
    requirePermission('tenant.manage')(req);
    const q = parseListQuery(req.query);
    const where = q.q ? { name: { contains: q.q, mode: 'insensitive' as const } } : {};
    const [items, total] = await Promise.all([
      prisma.tenant.findMany({ where, ...takeSkip(q), orderBy: { createdAt: 'desc' } }),
      prisma.tenant.count({ where }),
    ]);
    reply.send({ data: { items, page: q.page, pageSize: q.pageSize, total } });
  });

  app.post('/tenants', async (req, reply) => {
    requirePermission('tenant.manage')(req);
    const body = createTenantSchema.parse(req.body);

    const existing = await prisma.tenant.findUnique({ where: { slug: body.slug } });
    if (existing) throw AppError.conflict(`Tenant slug "${body.slug}" already exists`);

    const tenant = await prisma.$transaction(async (tx) => {
      const t = await tx.tenant.create({
        data: { name: body.name, slug: body.slug, locale: body.locale, timezone: body.timezone },
      });
      await ensureTenantRoles(t.id);
      const adminRole = await tx.role.findFirstOrThrow({ where: { tenantId: t.id, code: 'TENANT_ADMIN' } });
      const passwordHash = await hashPassword(body.adminPassword);
      const admin = await tx.user.create({
        data: {
          tenantId: t.id,
          email: body.adminEmail.toLowerCase(),
          passwordHash,
          name: body.adminName,
        },
      });
      await tx.userRole.create({ data: { userId: admin.id, roleId: adminRole.id } });
      await tx.organization.create({ data: { tenantId: t.id, name: body.name } });
      return t;
    });

    await writeAudit(req, { action: 'create', resourceType: 'tenant', resourceId: tenant.id, after: { name: tenant.name, slug: tenant.slug } });
    reply.code(201).send({ data: tenant });
  });

  app.get('/tenants/:id', async (req, reply) => {
    requirePermission('tenant.manage')(req);
    const { id } = req.params as { id: string };
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw AppError.notFound('Tenant not found');
    reply.send({ data: tenant });
  });

  app.get('/tenant/me', async (req, reply) => {
    const tenantId = requireTenantOfUser(req);
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { settings: true, features: true, integrations: true },
    });
    reply.send({ data: tenant });
  });

  app.get('/roles', async (req, reply) => {
    const tenantId = requireTenantOfUser(req);
    const roles = await prisma.role.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
    reply.send({ data: roles });
  });
}