import type { FastifyRequest } from 'fastify';
import { prisma } from '../lib/db.js';

export interface AuditInput {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  before?: unknown;
  after?: unknown;
  result?: string;
}

/**
 * Writes an immutable audit event. Never includes credentials, biometric
 * templates, tokens, or secrets (AGENTS.md #6).
 */
export async function writeAudit(req: FastifyRequest, input: AuditInput): Promise<void> {
  const user = req.authUser ?? undefined;
  const device = req.authDevice ?? undefined;
  try {
    await prisma.auditEvent.create({
      data: {
        tenantId: user?.tenantId ?? device?.tenantId ?? null,
        actorId: user?.userId,
        actorRole: user?.roles.join(',') || undefined,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? undefined,
        before: input.before === undefined ? undefined : (input.before as object),
        after: input.after === undefined ? undefined : (input.after as object),
        result: input.result ?? 'SUCCESS',
        requestId: req.id,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });
  } catch (err) {
    console.error('Audit write failed', err);
  }
}