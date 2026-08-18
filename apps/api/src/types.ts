import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { LoginIdentity } from './plugins/auth.js';

export interface AuthUser {
  userId: string;
  tenantId: string | null;
  roles: string[];
  perms: string[];
}

export interface AuthDevice {
  deviceId: string;
  tenantId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthUser;
    authDevice?: AuthDevice;
    idempotencyKey?: string;
  }

  interface FastifyInstance {
    signAccessToken(identity: LoginIdentity): string;
    getIdentityFromSubject(sub: string): Promise<LoginIdentity>;
  }
}

export interface JwtClaims {
  sub: string;
  tenantId: string | null;
  roles: string[];
  perms: string[];
}

export function requestUser(req: FastifyRequest): AuthUser {
  const user = req.authUser;
  if (!user) throw new Error('UNAUTHENTICATED');
  return user;
}

export function requiredTenant(req: FastifyRequest): string {
  const tenantId = req.authUser?.tenantId ?? req.authDevice?.tenantId;
  if (!tenantId) throw new Error('TENANT_REQUIRED');
  return tenantId;
}