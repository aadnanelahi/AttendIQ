import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError, notificationDispatchSchema } from '@attendiq/shared';
import { prisma } from '../lib/db.js';
import { writeAudit } from '../plugins/audit.js';
import { requirePermission, requireTenantOfUser } from '../plugins/auth.js';
import { parseListQuery, takeSkip } from '../lib/http.js';
import { dispatch } from '../lib/providers.js';

const templateSchema = z.object({
  code: z.string().min(1).max(100),
  channel: z.enum(['EMAIL', 'WHATSAPP']),
  subject: z.string().max(255).optional(),
  body: z.string().min(1).max(10000),
  variables: z.array(z.string()).default([]),
});

const preferenceSchema = z.object({
  channel: z.enum(['EMAIL', 'WHATSAPP']),
  event: z.string().min(1).max(100),
  enabled: z.boolean().default(true),
});

export function registerNotificationRoutes(app: FastifyInstance): void {
  app.get('/notifications/templates', async (req, reply) => {
    requirePermission('notification.read')(req);
    const tenantId = requireTenantOfUser(req);
    const templates = await prisma.notificationTemplate.findMany({ where: { tenantId }, orderBy: { code: 'asc' } });
    reply.send({ data: templates });
  });

  app.post('/notifications/templates', async (req, reply) => {
    requirePermission('notification.write')(req);
    const tenantId = requireTenantOfUser(req);
    const body = templateSchema.parse(req.body);
    const row = await prisma.notificationTemplate.create({
      data: { tenantId, code: body.code, channel: body.channel, subject: body.subject, body: body.body, variables: body.variables as never },
    });
    await writeAudit(req, { action: 'create', resourceType: 'notification_template', resourceId: row.id });
    reply.code(201).send({ data: row });
  });

  app.delete('/notifications/templates/:id', async (req, reply) => {
    requirePermission('notification.write')(req);
    const tenantId = requireTenantOfUser(req);
    const id = (req.params as { id?: string }).id;
    const existing = await prisma.notificationTemplate.findFirst({ where: { id, tenantId } });
    if (!existing) throw AppError.notFound('Notification template not found');
    await prisma.notificationTemplate.delete({ where: { id } });
    await writeAudit(req, { action: 'delete', resourceType: 'notification_template', resourceId: id });
    reply.code(204).send();
  });

  app.get('/notifications/preferences', async (req, reply) => {
    requirePermission('notification.read')(req);
    const tenantId = requireTenantOfUser(req);
    const prefs = await prisma.notificationPreference.findMany({ where: { tenantId } });
    reply.send({ data: prefs });
  });

  app.post('/notifications/preferences', async (req, reply) => {
    requirePermission('notification.write')(req);
    const tenantId = requireTenantOfUser(req);
    const body = preferenceSchema.parse(req.body);
    const row = await prisma.notificationPreference.create({ data: { ...body, tenantId } });
    await writeAudit(req, { action: 'create', resourceType: 'notification_preference', resourceId: row.id });
    reply.code(201).send({ data: row });
  });

  // --- Dispatch ---
  app.post('/notifications/dispatch', async (req, reply) => {
    requirePermission('notification.write')(req);
    const tenantId = requireTenantOfUser(req);
    const body = notificationDispatchSchema.parse(req.body);

    const template = await prisma.notificationTemplate.findFirst({
      where: { tenantId, code: body.templateCode, channel: body.channel },
    });

    const parse = (text: string): string =>
      text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(body.variables[key] ?? ''));

    let rendered = body.templateCode;
    let subject: string | undefined;
    let templateCode = body.templateCode;
    if (template) {
      rendered = parse(template.body);
      subject = template.subject ? parse(template.subject) : undefined;
      templateCode = template.code;
    }

    const event = await prisma.notificationEvent.create({
      data: { tenantId, type: body.templateCode, payload: body.variables as never },
    });

    const result = await dispatch(body.channel, {
      to: body.recipients,
      subject,
      body: rendered,
      templateCode,
    });

    const delivery = await prisma.notificationDelivery.create({
      data: {
        tenantId,
        eventId: event.id,
        channel: body.channel,
        recipient: body.recipients.join(','),
        templateCode,
        status: result.status,
        attempts: 1,
        deliveredAt: result.status === 'SENT' || result.status === 'STUBBED' ? new Date() : null,
      },
    });

    await writeAudit(req, { action: 'dispatch', resourceType: 'notification_delivery', resourceId: delivery.id, after: { status: result.status } });
    reply.code(201).send({ data: delivery });
  });

  app.get('/notifications/deliveries', async (req, reply) => {
    requirePermission('notification.read')(req);
    const tenantId = requireTenantOfUser(req);
    const q = parseListQuery(req.query);
    const [items, total] = await Promise.all([
      prisma.notificationDelivery.findMany({ where: { tenantId }, ...takeSkip(q), orderBy: { id: 'desc' } }),
      prisma.notificationDelivery.count({ where: { tenantId } }),
    ]);
    reply.send({ data: { items, page: q.page, pageSize: q.pageSize, total } });
  });
}