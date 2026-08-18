import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
import { AppError, IDEMPOTENCY_HEADER } from '@attendiq/shared';

interface StoredResponse {
  statusCode: number;
  payload: unknown;
  headers?: Record<string, string>;
}

interface CacheEntry {
  method: string;
  path: string;
  bodyHash: string;
  response?: StoredResponse;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();
const TTL_MS = 24 * 60 * 60 * 1000;

function bodyHash(req: FastifyRequest): string {
  const raw = (req.raw as unknown as { body?: string }).body;
  return createHash('sha256').update(typeof raw === 'string' ? raw : JSON.stringify(raw ?? {})).digest('hex');
}

/**
 * Idempotency via the `Idempotency-Key` header for mutating requests.
 * Same key + same request body replays the stored response; the same key with
 * a different body returns IDEMPOTENCY_CONFLICT (AGENTS.md, API_ERROR_CODES.md).
 * In-memory per instance; swap for Redis in multi-instance deployments.
 */
export default fp(async (app: FastifyInstance) => {
  app.addHook('onRequest', async (req, reply) => {
    if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return;
    const key = req.headers[IDEMPOTENCY_HEADER.toLowerCase()];
    if (typeof key !== 'string' || key.length === 0 || key.length > 128) return;

    const scope = req.authUser?.tenantId ?? req.authDevice?.tenantId ?? req.authUser?.userId ?? 'anonymous';
    const cacheKey = `${scope}:${key}`;
    const hash = bodyHash(req);

    const existing = store.get(cacheKey);
    if (existing) {
      if (existing.method !== req.method || existing.path !== (req.routeOptions?.url ?? req.url) || existing.bodyHash !== hash) {
        throw AppError.idempotencyConflicted();
      }
      if (existing.response) {
        await reply.code(existing.response.statusCode).header('x-idempotent-replay', 'true').send(existing.response.payload);
        return;
      }
    } else {
      store.set(cacheKey, { method: req.method, path: req.routeOptions?.url ?? req.url, bodyHash: hash, expiresAt: Date.now() + TTL_MS });
    }

    req.idempotencyKey = cacheKey;
  });

  app.addHook('onSend', async (req, reply, payload) => {
    const key = req.idempotencyKey;
    if (!key) return payload;
    let parsed: unknown = payload;
    try {
      parsed = JSON.parse(String(payload));
    } catch {
      parsed = payload;
    }
    const entry = store.get(key);
    if (entry) entry.response = { statusCode: reply.statusCode, payload: parsed };
    return payload;
  });

  // Opportunistic TTL cleanup.
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of store) {
      if (v.expiresAt < now) store.delete(k);
    }
  }, 60 * 60 * 1000);
  app.addHook('onClose', async () => clearInterval(timer));
});