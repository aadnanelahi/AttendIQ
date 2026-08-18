import type { FastifyInstance } from 'fastify';
import { AppError, changePasswordSchema, loginSchema, refreshSchema } from '@attendiq/shared';
import { prisma } from '../lib/db.js';
import { generateTokenHash, hashPassword, verifyPassword } from '../lib/hashing.js';
import { loadIdentity } from '../plugins/auth.js';
import { writeAudit } from '../plugins/audit.js';
import { env } from '../env.js';

interface RefreshToken {
  sessionId: string;
  secret: string;
}

function parseRefreshToken(token: string): RefreshToken | null {
  const i = token.indexOf('.');
  if (i <= 0) return null;
  return { sessionId: token.slice(0, i), secret: token.slice(i + 1) };
}

export function registerAuthRoutes(app: FastifyInstance): void {
  app.post('/auth/login', async (req, reply) => {
    const body = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    const okPassword = user ? await verifyPassword(body.password, user.passwordHash) : false;
    if (!user || !okPassword) {
      await prisma.securityEvent.create({
        data: { tenantId: user?.tenantId ?? null, userId: user?.id, type: 'LOGIN_FAILED', ip: req.ip, detail: { email: body.email } },
      });
      throw AppError.auth('Invalid credentials');
    }
    if (!user.isActive) throw AppError.auth('Account is disabled');

    const identity = await loadIdentity(user.id);
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: 'pending',
        expiresAt: new Date(Date.now() + env.jwtRefreshTtlDays * 86_400_000),
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });
    const { token, hash } = await generateTokenHash();
    await prisma.session.update({ where: { id: session.id }, data: { refreshTokenHash: hash } });
    const refreshToken = `${session.id}.${token}`;

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await writeAudit(req, { action: 'login', resourceType: 'user', resourceId: user.id });

    reply.send({
      data: {
        accessToken: app.signAccessToken(identity),
        refreshToken,
        expiresIn: env.jwtAccessTtl,
        user: { id: user.id, email: user.email, name: user.name, roles: identity.roles },
      },
    });
  });

  app.post('/auth/refresh', async (req, reply) => {
    const body = refreshSchema.parse(req.body);
    const parsed = parseRefreshToken(body.refreshToken);
    if (!parsed) throw AppError.auth('Invalid refresh token');
    const session = await prisma.session.findUnique({ where: { id: parsed.sessionId } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw AppError.auth('Invalid or expired session');
    }
    const valid = await verifyPassword(parsed.secret, session.refreshTokenHash);
    if (!valid) throw AppError.auth('Invalid refresh token');

    const identity = await loadIdentity(session.userId);
    await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    const newSession = await prisma.session.create({
      data: {
        userId: session.userId,
        refreshTokenHash: 'pending',
        expiresAt: new Date(Date.now() + env.jwtRefreshTtlDays * 86_400_000),
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });
    const { token, hash } = await generateTokenHash();
    await prisma.session.update({ where: { id: newSession.id }, data: { refreshTokenHash: hash } });
    const refreshToken = `${newSession.id}.${token}`;

    reply.send({
      data: {
        accessToken: app.signAccessToken(identity),
        refreshToken,
        expiresIn: env.jwtAccessTtl,
      },
    });
  });

  app.post('/auth/logout', async (req, reply) => {
    const user = req.authUser ?? null;
    const body = refreshSchema.parse(req.body);
    const parsed = parseRefreshToken(body.refreshToken);
    if (parsed) {
      await prisma.session.updateMany({
        where: { id: parsed.sessionId, userId: user?.userId },
        data: { revokedAt: new Date() },
      });
    }
    reply.code(204).send();
  });

  app.get('/auth/me', async (req, reply) => {
    if (!req.authUser) throw AppError.auth();
    const user = await prisma.user.findUnique({
      where: { id: req.authUser.userId },
      include: { employee: { select: { id: true, employeeNumber: true, firstName: true, lastName: true } } },
    });
    if (!user) throw AppError.auth('User not found');
    reply.send({ data: { id: user.id, email: user.email, name: user.name, tenantId: user.tenantId, roles: req.authUser.roles, perms: req.authUser.perms, employee: user.employee } });
  });

  app.post('/auth/change-password', async (req, reply) => {
    if (!req.authUser) throw AppError.auth();
    const body = changePasswordSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.authUser.userId } });
    if (!user) throw AppError.auth('User not found');
    const valid = await verifyPassword(body.currentPassword, user.passwordHash);
    if (!valid) throw AppError.validation('Current password is incorrect');
    const passwordHash = await hashPassword(body.newPassword);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    await prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await writeAudit(req, { action: 'change_password', resourceType: 'user', resourceId: user.id });
    reply.code(204).send();
  });

  app.get('/auth/sessions', async (req, reply) => {
    if (!req.authUser) throw AppError.auth();
    const sessions = await prisma.session.findMany({
      where: { userId: req.authUser.userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, userAgent: true, ip: true, createdAt: true, expiresAt: true },
    });
    reply.send({ data: sessions });
  });

  app.delete('/auth/sessions/:id', async (req, reply) => {
    if (!req.authUser) throw AppError.auth();
    const { id } = req.params as { id: string };
    await prisma.session.updateMany({ where: { id, userId: req.authUser.userId }, data: { revokedAt: new Date() } });
    await writeAudit(req, { action: 'revoke_session', resourceType: 'session', resourceId: id });
    reply.code(204).send();
  });
}