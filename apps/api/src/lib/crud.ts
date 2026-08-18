import type { FastifyInstance } from 'fastify';
import type { z } from 'zod';
import { AppError } from '@attendiq/shared';
import { writeAudit } from '../plugins/audit.js';
import { requirePermission, requireTenantOfUser } from '../plugins/auth.js';
import { parseId, parseListQuery, takeSkip } from '../lib/http.js';

// Prisma model delegates are structurally compatible with this surface.
export interface CrudDelegate {
  findMany(args: unknown): Promise<Record<string, unknown>[]>;
  count(args: unknown): Promise<number>;
  findUnique(args: unknown): Promise<Record<string, unknown> | null>;
  create(args: unknown): Promise<Record<string, unknown>>;
  update(args: unknown): Promise<Record<string, unknown>>;
  delete(args: unknown): Promise<Record<string, unknown>>;
}

export interface CrudConfig {
  delegate: CrudDelegate;
  createSchema: z.ZodTypeAny;
  updateSchema?: z.ZodTypeAny;
  /** Audit resource type (e.g. 'branch'). */
  resource: string;
  /** Permission required to create/update/delete. */
  permissionWrite: string;
  /** Permission required to list/get. */
  permissionRead?: string;
  /** Plain columns searched by the `q` filter. */
  searchFields?: string[];
  /** Fixed include map for reads. */
  include?: Record<string, boolean>;
  /** Sort mapping, e.g. { updatedAt: 'desc' }. */
  orderBy?: Record<string, 'asc' | 'desc'>;
  /** Runs after tenantId injection, before create. */
  beforeCreate?: (data: Record<string, unknown>) => Record<string, unknown>;
  /** Runs after parsing and tenantId stripping, before update. */
  beforeUpdate?: (data: Record<string, unknown>) => Record<string, unknown>;
}

export function registerCrud(app: FastifyInstance, prefix: string, cfg: CrudConfig): void {
  const readPerm = cfg.permissionRead;
  const writePerm = cfg.permissionWrite;

  app.get(prefix, async (req, reply) => {
    if (readPerm) requirePermission(readPerm)(req);
    const tenantId = requireTenantOfUser(req);
    const q = parseListQuery(req.query);
    const where: Record<string, unknown> = { tenantId };
    if (q.q && cfg.searchFields) {
      where.OR = cfg.searchFields.map((field) => ({ [field]: { contains: q.q, mode: 'insensitive' } }));
    }
    const [items, total] = await Promise.all([
      cfg.delegate.findMany({
        where,
        include: cfg.include,
        orderBy: cfg.orderBy ?? { updatedAt: 'desc' as const },
        ...takeSkip(q),
      }),
      cfg.delegate.count({ where }),
    ]);
    reply.send({ data: { items, page: q.page, pageSize: q.pageSize, total } });
  });

  app.get(`${prefix}/:id`, async (req, reply) => {
    if (readPerm) requirePermission(readPerm)(req);
    const tenantId = requireTenantOfUser(req);
    const id = parseId(req);
    const row = await cfg.delegate.findUnique({ where: { id }, include: cfg.include });
    if (!row || row.tenantId !== tenantId) throw AppError.notFound(`${cfg.resource} not found`);
    reply.send({ data: row });
  });

  app.post(prefix, async (req, reply) => {
    requirePermission(writePerm)(req);
    const tenantId = requireTenantOfUser(req);
    const body = cfg.createSchema.parse(req.body);
    const data = cfg.beforeCreate ? cfg.beforeCreate({ ...body, tenantId }) : { ...body, tenantId };
    const row = await cfg.delegate.create({ data: data as never });
    await writeAudit(req, { action: 'create', resourceType: cfg.resource, resourceId: String(row.id), after: row });
    reply.code(201).send({ data: row });
  });

  app.put(`${prefix}/:id`, async (req, reply) => {
    requirePermission(writePerm)(req);
    const tenantId = requireTenantOfUser(req);
    const id = parseId(req);
    const existing = await cfg.delegate.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== tenantId) throw AppError.notFound(`${cfg.resource} not found`);
    const schema = cfg.updateSchema ?? cfg.createSchema;
    const body = (schema as z.ZodObject<z.ZodRawShape>).partial().parse(req.body);
    const { tenantId: _ignored, ...updates } = body as Record<string, unknown>;
    void _ignored;
    const data = cfg.beforeUpdate ? cfg.beforeUpdate(updates) : updates;
    const row = await cfg.delegate.update({ where: { id }, data: data as never });
    await writeAudit(req, { action: 'update', resourceType: cfg.resource, resourceId: id, before: existing, after: row });
    reply.send({ data: row });
  });

  app.delete(`${prefix}/:id`, async (req, reply) => {
    requirePermission(writePerm)(req);
    const tenantId = requireTenantOfUser(req);
    const id = parseId(req);
    const existing = await cfg.delegate.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== tenantId) throw AppError.notFound(`${cfg.resource} not found`);
    await cfg.delegate.delete({ where: { id } });
    await writeAudit(req, { action: 'delete', resourceType: cfg.resource, resourceId: id, before: existing });
    reply.code(204).send();
  });
}