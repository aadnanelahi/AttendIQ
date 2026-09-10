import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requirePermission, requireTenantOfUser } from '../plugins/auth.js';
import { listLocks, listUnlockRecords, ttlockConfig } from '../modules/ttlock.js';

const recordsSchema = z.object({
  lockId: z.number().int().positive(),
  pageSize: z.number().int().min(1).max(100).default(30),
});

export function registerAccessTtlockRoutes(app: FastifyInstance): void {
  app.get('/access/ttlock/config', async (req, reply) => {
    requirePermission('access.read')(req);
    requireTenantOfUser(req);
    const config = ttlockConfig();
    reply.send({ data: config });
  });

  app.get('/access/ttlock/locks', async (req, reply) => {
    requirePermission('access.read')(req);
    requireTenantOfUser(req);
    const config = ttlockConfig();
    if (!config.configured) {
      reply.send({ data: { configured: false, apiBase: config.apiBase, missing: config.missing, locks: [] } });
      return;
    }
    try {
      const locks = await listLocks();
      reply.send({ data: { configured: true, apiBase: config.apiBase, missing: [], locks } });
    } catch (err) {
      reply.send({
        data: {
          configured: true,
          apiBase: config.apiBase,
          missing: [],
          locks: [],
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  });

  app.post('/access/ttlock/records', async (req, reply) => {
    requirePermission('access.read')(req);
    requireTenantOfUser(req);
    const config = ttlockConfig();
    if (!config.configured) {
      reply.send({ data: { configured: false, apiBase: config.apiBase, missing: config.missing, records: [] } });
      return;
    }
    const body = recordsSchema.parse(req.body);
    try {
      const records = await listUnlockRecords(body.lockId, body.pageSize);
      reply.send({ data: { configured: true, apiBase: config.apiBase, missing: [], lockId: body.lockId, records } });
    } catch (err) {
      reply.send({
        data: {
          configured: true,
          apiBase: config.apiBase,
          missing: [],
          lockId: body.lockId,
          records: [],
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  });
}