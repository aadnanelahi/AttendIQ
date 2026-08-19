import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError, deviceSchema } from '@attendiq/shared';
import { prisma } from '../lib/db.js';
import { generateOpaqueToken, hashPassword } from '../lib/hashing.js';
import { writeAudit } from '../plugins/audit.js';
import { requirePermission, requireTenantOfUser } from '../plugins/auth.js';
import { parseId, parseListQuery, takeSkip } from '../lib/http.js';

const syncJobTypeSchema = z.enum(['USER_SYNC', 'TEMPLATE_SYNC', 'CONFIG_SYNC', 'TIME_SYNC', 'QUERY']);
const syncJobCreateSchema = z.object({
  type: syncJobTypeSchema.default('CONFIG_SYNC'),
  payload: z.unknown().optional(),
});

export function registerDeviceRoutes(app: FastifyInstance): void {
  app.get('/devices', async (req, reply) => {
    requirePermission('device.read')(req);
    const tenantId = requireTenantOfUser(req);
    const q = parseListQuery(req.query);
    const where: Record<string, unknown> = { tenantId };
    if (q.q) {
      where.OR = [
        { deviceId: { contains: q.q, mode: 'insensitive' } },
        { vendor: { contains: q.q, mode: 'insensitive' } },
        { model: { contains: q.q, mode: 'insensitive' } },
        { serialNumber: { contains: q.q, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      prisma.device.findMany({ where, ...takeSkip(q), orderBy: { updatedAt: 'desc' }, include: { branch: true, location: true } }),
      prisma.device.count({ where }),
    ]);
    reply.send({ data: { items, page: q.page, pageSize: q.pageSize, total } });
  });

  app.get('/devices/:id', async (req, reply) => {
    requirePermission('device.read')(req);
    const tenantId = requireTenantOfUser(req);
    const id = parseId(req);
    const device = await prisma.device.findFirst({ where: { id, tenantId }, include: { branch: true, location: true, health: { orderBy: { checkedAt: 'desc' }, take: 1 } } });
    if (!device) throw AppError.notFound('Device not found');
    reply.send({ data: device });
  });

  app.post('/devices', async (req, reply) => {
    requirePermission('device.write')(req);
    const tenantId = requireTenantOfUser(req);
    const body = deviceSchema.parse(req.body);

    const existing = await prisma.device.findFirst({ where: { tenantId, deviceId: body.deviceId } });
    if (existing) throw AppError.conflict(`Device ${body.deviceId} already registered`);

    const apiKeyId = `dkey_${generateOpaqueToken().slice(0, 16)}`;
    const secret = generateOpaqueToken();
    const credentialsRef = await hashPassword(secret);

    const device = await prisma.device.create({
      data: { tenantId, ...body, apiKeyId, credentialsRef },
    });
    await writeAudit(req, { action: 'create', resourceType: 'device', resourceId: device.id, after: { deviceId: body.deviceId, vendor: body.vendor, model: body.model } });
    // Token shown once; store only the hash (AGENTS.md #6).
    reply.code(201).send({ data: device, deviceToken: `${apiKeyId}.${secret}` });
  });

  app.put('/devices/:id', async (req, reply) => {
    requirePermission('device.write')(req);
    const tenantId = requireTenantOfUser(req);
    const id = parseId(req);
    const existing = await prisma.device.findFirst({ where: { id, tenantId } });
    if (!existing) throw AppError.notFound('Device not found');
    const body = deviceSchema.partial().parse(req.body);
    const { apiKeyId: _ignored, ...updates } = body as Record<string, unknown>;
    void _ignored;
    const device = await prisma.device.update({ where: { id }, data: updates as never });
    await writeAudit(req, { action: 'update', resourceType: 'device', resourceId: id, before: { deviceId: existing.deviceId }, after: { deviceId: device.deviceId } });
    reply.send({ data: device });
  });

  app.delete('/devices/:id', async (req, reply) => {
    requirePermission('device.delete')(req);
    const tenantId = requireTenantOfUser(req);
    const id = parseId(req);
    const existing = await prisma.device.findFirst({ where: { id, tenantId } });
    if (!existing) throw AppError.notFound('Device not found');
    await prisma.device.delete({ where: { id } });
    await writeAudit(req, { action: 'delete', resourceType: 'device', resourceId: id, before: { deviceId: existing.deviceId } });
    reply.code(204).send();
  });

  app.post('/devices/:id/rotate-token', async (req, reply) => {
    requirePermission('device.write')(req);
    const tenantId = requireTenantOfUser(req);
    const id = parseId(req);
    const existing = await prisma.device.findFirst({ where: { id, tenantId } });
    if (!existing) throw AppError.notFound('Device not found');
    const apiKeyId = `dkey_${generateOpaqueToken().slice(0, 16)}`;
    const secret = generateOpaqueToken();
    const credentialsRef = await hashPassword(secret);
    await prisma.device.update({ where: { id }, data: { apiKeyId, credentialsRef } });
    await writeAudit(req, { action: 'rotate_token', resourceType: 'device', resourceId: id });
    reply.send({ data: { deviceId: existing.deviceId }, deviceToken: `${apiKeyId}.${secret}` });
  });

  app.post('/devices/:id/health', async (req, reply) => {
    requirePermission('device.write')(req);
    const tenantId = requireTenantOfUser(req);
    const id = parseId(req);
    const existing = await prisma.device.findFirst({ where: { id, tenantId } });
    if (!existing) throw AppError.notFound('Device not found');
    const body = (req.body ?? {}) as { status?: string; signal?: number; battery?: number };
    const health = await prisma.deviceHealth.create({
      data: { tenantId, deviceId: id, status: body.status ?? 'ONLINE', signal: body.signal, battery: body.battery },
    });
    await prisma.device.update({ where: { id }, data: { lastSeenAt: new Date() } });
    reply.send({ data: health });
  });

  app.get('/devices/:id/sync-jobs', async (req, reply) => {
    requirePermission('device.read')(req);
    const tenantId = requireTenantOfUser(req);
    const id = parseId(req);
    const jobs = await prisma.deviceSyncJob.findMany({ where: { deviceId: id, tenantId }, orderBy: { requestedAt: 'desc' }, take: 50 });
    reply.send({ data: jobs });
  });

  app.post('/devices/:id/sync-jobs', async (req, reply) => {
    requirePermission('device.write')(req);
    const tenantId = requireTenantOfUser(req);
    const id = parseId(req);
    const existing = await prisma.device.findFirst({ where: { id, tenantId } });
    if (!existing) throw AppError.notFound('Device not found');
    const body = syncJobCreateSchema.parse(req.body ?? {});
    const job = await prisma.deviceSyncJob.create({
      data: {
        tenantId,
        deviceId: id,
        type: body.type,
        payload: (body.payload as object | undefined) ?? undefined,
      },
    });
    await writeAudit(req, { action: 'create_sync_job', resourceType: 'device_sync_job', resourceId: job.id, after: { deviceId: existing.deviceId, type: body.type } });
    reply.code(201).send({ data: job });
  });
}