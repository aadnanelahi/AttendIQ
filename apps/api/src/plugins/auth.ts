import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from '@attendiq/shared';
import { env } from '../env.js';
import { prisma } from '../lib/db.js';
import { verifyPassword } from '../lib/hashing.js';
import type { AuthDevice, AuthUser, JwtClaims } from '../types.js';

export interface LoginIdentity {
  userId: string;
  tenantId: string | null;
  roles: string[];
  perms: string[];
}

export async function loadIdentity(userId: string): Promise<LoginIdentity> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { userRoles: { include: { role: true } } },
  });
  if (!user) throw AppError.auth('User not found');

  const roles = user.userRoles.map((r) => r.role.code);
  const perms = new Set<string>();
  if (roles.includes('PLATFORM_SUPER_ADMIN')) {
    for (const p of (user.userRoles.flatMap((r) => r.role.permissions as string[]))) perms.add(p);
  } else {
    for (const p of user.userRoles.flatMap((r) => r.role.permissions as string[])) perms.add(p);
  }
  return { userId: user.id, tenantId: user.tenantId, roles, perms: [...perms] };
}

function makeJwtPayload(identity: LoginIdentity): JwtClaims {
  return {
    sub: identity.userId,
    tenantId: identity.tenantId,
    roles: identity.roles,
    perms: identity.perms,
  };
}

export default fp(async (app: FastifyInstance) => {
  await app.register(import('@fastify/jwt'), { secret: env.jwtSecret });

  app.addHook('onRequest', async (req) => {
    const bearer = req.headers.authorization;
    if (bearer?.startsWith('Bearer ')) {
      try {
        const claims = app.jwt.verify<JwtClaims>(bearer.slice(7));
        req.authUser = {
          userId: claims.sub,
          tenantId: claims.tenantId,
          roles: claims.roles,
          perms: claims.perms,
        };
      } catch {
        throw AppError.auth('Invalid or expired token');
      }
      return;
    }

    const deviceToken = req.headers['x-device-token'];
    if (typeof deviceToken === 'string' && deviceToken.length > 0) {
      const separator = deviceToken.indexOf('.');
      const apiKeyId = separator > 0 ? deviceToken.slice(0, separator) : '';
      const secret = separator > 0 ? deviceToken.slice(separator + 1) : '';
      if (!apiKeyId || !secret) throw AppError.auth('Invalid device token');
      const device = await prisma.device.findUnique({ where: { apiKeyId } });
      if (!device?.credentialsRef || !device.isActive) throw AppError.auth('Invalid device token');
      const match = await verifyPassword(secret, device.credentialsRef);
      if (!match) throw AppError.auth('Invalid device token');
      req.authDevice = { deviceId: device.id, tenantId: device.tenantId };
    }
  });

  app.decorate('signAccessToken', (identity: LoginIdentity) =>
    app.jwt.sign(makeJwtPayload(identity), { expiresIn: env.jwtAccessTtl }),
  );

  app.decorate('getIdentityFromSubject', (sub: string) => loadIdentity(sub));
});

export function requireUser(req: FastifyRequest): AuthUser {
  const user = req.authUser ?? undefined;
  if (!user) throw AppError.auth();
  return user;
}

export function requirePermission(permission: string) {
  return (req: FastifyRequest): void => {
    const user = requireUser(req);
    if (user.roles.includes('PLATFORM_SUPER_ADMIN')) return;
    if (!user.perms.includes(permission)) {
      throw AppError.forbidden(`Requires permission: ${permission}`);
    }
  };
}

export function requireTenantOfUser(req: FastifyRequest): string {
  const user = requireUser(req);
  if (!user.tenantId) throw AppError.tenantDenied('Platform users have no tenant context');
  return user.tenantId;
}

export function requireTenantAccess(req: FastifyRequest, requestedTenantId: string): void {
  const user = requireUser(req);
  if (user.roles.includes('PLATFORM_SUPER_ADMIN')) return;
  if (user.tenantId !== requestedTenantId) throw AppError.tenantDenied();
}

export function authDeviceOf(req: FastifyRequest): AuthDevice {
  const device = req.authDevice ?? undefined;
  if (!device) throw AppError.auth('Device authentication required');
  return device;
}