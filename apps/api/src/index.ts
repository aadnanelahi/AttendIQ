import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { ZodError } from 'zod';
import { AppError, errorStatusCode, type ApiErrorCode } from '@attendiq/shared';
import { env } from './env.js';
import { prisma } from './lib/db.js';
import authPlugin from './plugins/auth.js';
import idempotencyPlugin from './plugins/idempotency.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerTenantRoutes } from './routes/tenants.js';
import { registerOrgRoutes } from './routes/organizations.js';
import { registerEmployeeRoutes } from './routes/employees.js';
import { registerDeviceRoutes } from './routes/devices.js';
import { registerDeviceGateway } from './routes/device-gateway.js';
import { registerAttendanceRoutes } from './routes/attendance.js';
import { registerShiftRoutes } from './routes/shifts.js';
import { registerLeaveRoutes } from './routes/leave.js';
import { registerOvertimeRoutes } from './routes/overtime.js';
import { registerPayrollRoutes } from './routes/payroll.js';
import { registerAccessRoutes } from './routes/access.js';
import { registerVisitorRoutes } from './routes/visitors.js';
import { registerNotificationRoutes } from './routes/notifications.js';
import { registerReportRoutes } from './routes/reports.js';
import { registerAuditRoutes } from './routes/audit.js';
import { registerAiRoutes } from './routes/ai.js';

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
  requestIdHeader: 'x-request-id',
  trustProxy: true,
  bodyLimit: 5 * 1024 * 1024,
});

async function main(): Promise<void> {
  await app.register(cors, { origin: true, credentials: true });
  await app.register(rateLimit, { max: Number(process.env.RATE_LIMIT_MAX ?? 300), timeWindow: '1 minute' });
  await app.register(swagger, {
    openapi: {
      info: { title: 'AttendIQ Workforce API', version: '1.0.0' },
      servers: [{ url: `/api/v1` }],
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  await app.register(authPlugin);
  await app.register(idempotencyPlugin);

  // Error envelope (docs/api/API_ERROR_CODES.md).
  app.setErrorHandler(async (err: Error, req, reply) => {
    if (err instanceof AppError) {
      const body = {
        code: err.code,
        message: err.message,
        requestId: req.id,
        ...(err.fieldErrors ? { fieldErrors: err.fieldErrors } : {}),
        ...(err.details !== undefined ? { details: err.details } : {}),
      };
      return reply.code(err.statusCode).send(body);
    }

    if (err instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of err.issues) {
        const key = issue.path.join('.') || '_';
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      return reply.code(400).send({ code: 'VALIDATION_ERROR', message: 'Invalid request payload', requestId: req.id, fieldErrors });
    }

    const code: ApiErrorCode = 'INTERNAL_ERROR';
    const statusCode = errorStatusCode(code);
    req.log.error({ err }, 'Unhandled error');
    return reply.code(statusCode).send({
      code,
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
      requestId: req.id,
    });
  });

  app.get('/health', async (_req, reply) => {
    await prisma.$queryRaw`SELECT 1`;
    reply.send({ status: 'ok', service: 'attendiq-api', time: new Date().toISOString() });
  });

  await app.register(
    async (api) => {
      registerAuthRoutes(api);
      registerTenantRoutes(api);
      registerOrgRoutes(api);
      registerEmployeeRoutes(api);
      registerDeviceRoutes(api);
      registerDeviceGateway(api);
      registerAttendanceRoutes(api);
      registerShiftRoutes(api);
      registerLeaveRoutes(api);
      registerOvertimeRoutes(api);
      registerPayrollRoutes(api);
      registerAccessRoutes(api);
      registerVisitorRoutes(api);
      registerNotificationRoutes(api);
      registerReportRoutes(api);
      registerAuditRoutes(api);
      registerAiRoutes(api);
    },
    { prefix: '/api/v1' },
  );

  const port = env.port;
  await app.listen({ port, host: process.env.HOST ?? '0.0.0.0' });
  app.log.info(`AttendIQ API listening on ${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await app.close();
    process.exit(0);
  });
}
