import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '@attendiq/shared';
import { prisma } from '../lib/db.js';
import { writeAudit } from '../plugins/audit.js';
import { requirePermission, requireTenantOfUser, requireUser } from '../plugins/auth.js';
import { parseId } from '../lib/http.js';

const chatSchema = z.object({
  message: z.string().min(1).max(8000),
  sessionId: z.string().optional(),
});

const feedbackSchema = z.object({
  messageId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  note: z.string().max(2000).optional(),
});

export function registerAiRoutes(app: FastifyInstance): void {
  app.get('/ai/sessions', async (req, reply) => {
    requirePermission('ai.chat')(req);
    const tenantId = requireTenantOfUser(req);
    const user = requireUser(req);
    const sessions = await prisma.aiSession.findMany({
      where: { tenantId, userId: user.userId },
      include: { _count: { select: { messages: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    reply.send({ data: sessions });
  });

  app.post('/ai/sessions', async (req, reply) => {
    requirePermission('ai.chat')(req);
    const tenantId = requireTenantOfUser(req);
    const user = requireUser(req);
    const body = (req.body ?? {}) as { title?: string };
    const session = await prisma.aiSession.create({ data: { tenantId, userId: user.userId, title: body.title ?? null } });
    await writeAudit(req, { action: 'create', resourceType: 'ai_session', resourceId: session.id });
    reply.code(201).send({ data: session });
  });

  app.get('/ai/sessions/:id/messages', async (req, reply) => {
    requirePermission('ai.chat')(req);
    const tenantId = requireTenantOfUser(req);
    const user = requireUser(req);
    const id = parseId(req);
    const session = await prisma.aiSession.findFirst({ where: { id, tenantId, userId: user.userId } });
    if (!session) throw AppError.notFound('AI session not found');
    const messages = await prisma.aiMessage.findMany({ where: { sessionId: id }, orderBy: { createdAt: 'asc' } });
    reply.send({ data: messages });
  });

  // --- Chat (tenant-scoped, stateless rule-based stub) ---
  app.post('/ai/chat', async (req, reply) => {
    requirePermission('ai.chat')(req);
    const tenantId = requireTenantOfUser(req);
    const user = requireUser(req);
    const body = chatSchema.parse(req.body);

    let sessionId = body.sessionId;
    if (sessionId) {
      const session = await prisma.aiSession.findFirst({ where: { id: sessionId, tenantId, userId: user.userId } });
      if (!session) throw AppError.notFound('AI session not found');
    } else {
      const session = await prisma.aiSession.create({ data: { tenantId, userId: user.userId } });
      sessionId = session.id;
    }

    await prisma.aiMessage.create({ data: { tenantId, sessionId, role: 'user', content: body.message } });

    const replyText = answer(body.message);

    const assistant = await prisma.aiMessage.create({ data: { tenantId, sessionId, role: 'assistant', content: replyText } });

    const short = body.message.toLowerCase();
    const tool =
      short.includes('absent') || short.includes('late') ? 'ATTENDANCE_LOOKUP'
      : short.includes('shift') || short.includes('roster') ? 'SHIFT_LOOKUP'
      : short.includes('salary') || short.includes('pay') ? 'PAYROLL_LOOKUP'
      : short.includes('leave') || short.includes('vacation') ? 'LEAVE_LOOKUP'
      : 'GENERAL';
    if (tool !== 'GENERAL') {
      await prisma.aiToolCall.create({ data: { tenantId, sessionId, tool, input: { query: body.message } as never, output: { note: 'stub' } as never } });
    }
    await prisma.aiUsage.create({ data: { tenantId, userId: user.userId, model: 'stub', inputTokens: Math.ceil(body.message.length / 4), outputTokens: Math.ceil(replyText.length / 4) } });

    reply.send({ data: { sessionId, message: assistant } });
  });

  app.post('/ai/feedback', async (req, reply) => {
    requirePermission('ai.chat')(req);
    const tenantId = requireTenantOfUser(req);
    const body = feedbackSchema.parse(req.body);
    const message = await prisma.aiMessage.findFirst({ where: { id: body.messageId, tenantId } });
    if (!message) throw AppError.notFound('AI message not found');
    const feedback = await prisma.aiFeedback.create({ data: { tenantId, messageId: body.messageId, rating: body.rating, note: body.note } });
    reply.code(201).send({ data: feedback });
  });
}

function answer(message: string): string {
  const text = message.toLowerCase();
  if (text.includes('absent') || text.includes('late')) {
    return 'You can review late arrivals and absences under Attendance > Transactions or export the Attendance report from Reports. Filter by date range to narrow results.';
  }
  if (text.includes('shift') || text.includes('roster')) {
    return 'Shifts and rosters are managed under Scheduling. You can create shifts, assign employee schedules with effective dates, and publish daily rosters.';
  }
  if (text.includes('salary') || text.includes('pay') || text.includes('wage')) {
    return 'Payroll runs are created per period from attendance data. Go to Payroll > Periods to create a period, then start a run; payslips are generated after the run completes.';
  }
  if (text.includes('leave') || text.includes('vacation') || text.includes('annual')) {
    return 'Leave requests are handled under Leave. Balances accrue per policy and are computed automatically; approvals move requests to APPROVED and deduct usage.';
  }
  if (text.includes('device') || text.includes('gateway') || text.includes('biometric')) {
    return 'Devices and the device gateway are under Devices. Transactions arrive through /device-gateway/transactions and trigger per-day recalculation automatically.';
  }
  if (text.includes('report')) {
    return 'Available reports include the dashboard summary (/reports/summary) and an attendance detail export (/reports/attendance) in CSV format.';
  }
  return 'I can help navigate attendance, scheduling, leave, payroll, devices, and reports. Ask about a specific area for guidance.';
}