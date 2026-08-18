import type { FastifyInstance } from 'fastify';
import { AppError, leavePolicySchema, leaveRequestSchema, leaveTypeSchema } from '@attendiq/shared';
import { computeLeaveBalance, leaveDaysCount, validateLeaveUsage } from '@attendiq/core';
import { prisma, Prisma } from '../lib/db.js';
import { registerCrud } from '../lib/crud.js';
import { writeAudit } from '../plugins/audit.js';
import { requirePermission, requireTenantOfUser, requireUser } from '../plugins/auth.js';
import { parseId, parseListQuery, takeSkip } from '../lib/http.js';

export function registerLeaveRoutes(app: FastifyInstance): void {
  registerCrud(app, '/leave/types', {
    delegate: prisma.leaveType,
    createSchema: leaveTypeSchema,
    resource: 'leave_type',
    permissionWrite: 'leave.write',
    permissionRead: 'leave.read',
    searchFields: ['name', 'code'],
    orderBy: { code: 'asc' },
  });

  registerCrud(app, '/leave/policies', {
    delegate: prisma.leavePolicy,
    createSchema: leavePolicySchema,
    resource: 'leave_policy',
    permissionWrite: 'leave.write',
    permissionRead: 'leave.read',
    orderBy: { name: 'asc' },
  });

  app.get('/leave/balances', async (req, reply) => {
    requirePermission('leave.read')(req);
    const tenantId = requireTenantOfUser(req);
    const q = parseListQuery(req.query);
    const employeeId = (req.query as { employeeId?: string }).employeeId;
    if (!employeeId) throw AppError.validation('employeeId is required');
    const employee = await prisma.employee.findFirst({ where: { id: employeeId, tenantId } });
    if (!employee) throw AppError.notFound('Employee not found');

    const policies = await prisma.leavePolicy.findMany({
      where: { tenantId },
      include: { leaveType: true },
    });
    const year = new Date().getUTCFullYear();
    const usedRows = await prisma.leaveTransaction.groupBy({
      by: ['leaveTypeId'],
      where: { tenantId, employeeId, type: 'USE' },
      _sum: { amount: true },
    });
    const usedByType = new Map(usedRows.map((r) => [r.leaveTypeId, r._sum.amount ?? 0]));

    const balances = await Promise.all(
      policies.map(async (policy) => {
        const used = usedByType.get(policy.leaveTypeId) ?? 0;
        const existing = await prisma.leaveBalance.findUnique({
          where: { tenantId_employeeId_leaveTypeId_year: { tenantId, employeeId, leaveTypeId: policy.leaveTypeId, year } },
        });
        const computed = computeLeaveBalance({
          policy: {
            accrualFrequency: policy.accrualFrequency,
            accrualAmount: policy.accrualAmount,
            accrualUnit: policy.accrualUnit === 'HOURS' ? 'HOURS' : 'DAYS',
            proRated: policy.proRated,
            carryoverLimit: policy.carryoverLimit,
            maxBalance: policy.maxBalance,
            anniversaryBasis: policy.anniversaryBasis,
          },
          joinDate: employee.joiningDate ? employee.joiningDate.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
          asOfDate: new Date().toISOString().slice(0, 10),
          openingBalance: existing?.openingBalance ?? 0,
          usedSoFar: used,
          carryoverFromPrev: existing?.carryover ?? 0,
        });
        return {
          leaveTypeId: policy.leaveTypeId,
          leaveTypeCode: policy.leaveType.code,
          leaveTypeName: policy.leaveType.name,
          accrual: computed.accrued,
          used: computed.used,
          remaining: computed.remaining,
          nextAccrualDate: computed.nextAccrualDate,
          policyId: policy.id,
        };
      }),
    );
    void q;
    reply.send({ data: balances });
  });

  app.get('/leave/requests', async (req, reply) => {
    requirePermission('leave.read')(req);
    const tenantId = requireTenantOfUser(req);
    const q = parseListQuery(req.query);
    const where: Prisma.LeaveRequestWhereInput = { tenantId };
    if (q.from || q.to) {
      where.from = {};
      where.to = {};
      if (q.from) where.from.gte = new Date(`${q.from}T00:00:00.000Z`);
      if (q.to) where.to.lte = new Date(`${q.to}T23:59:59.999Z`);
    }
    const [items, total] = await Promise.all([
      prisma.leaveRequest.findMany({
        where,
        include: { employee: { select: { id: true, employeeNumber: true, firstName: true, lastName: true } }, leaveType: true, approvals: true },
        ...takeSkip(q),
        orderBy: { submittedAt: 'desc' },
      }),
      prisma.leaveRequest.count({ where }),
    ]);
    reply.send({ data: { items, page: q.page, pageSize: q.pageSize, total } });
  });

  app.post('/leave/requests', async (req, reply) => {
    requirePermission('leave.write')(req);
    const tenantId = requireTenantOfUser(req);
    const user = requireUser(req);
    const body = leaveRequestSchema.parse(req.body);

    const employee = user.tenantId === tenantId
      ? await prisma.employee.findFirst({ where: { tenantId, userId: user.userId } })
      : null;
    const effectiveEmployeeId = (req.body as { employeeId?: string }).employeeId ?? employee?.id;
    if (!effectiveEmployeeId) throw AppError.validation('employeeId is required');
    const target = await prisma.employee.findFirst({ where: { id: effectiveEmployeeId, tenantId } });
    if (!target) throw AppError.notFound('Employee not found');

    const leaveType = await prisma.leaveType.findFirst({ where: { id: body.leaveTypeId, tenantId } });
    if (!leaveType) throw AppError.notFound('Leave type not found');
    const policy = await prisma.leavePolicy.findFirst({ where: { tenantId, leaveTypeId: body.leaveTypeId } });

    const days = leaveDaysCount(body.from, body.to, body.halfDay);
    if (policy) {
      const usedRows = await prisma.leaveTransaction.aggregate({
        where: { tenantId, employeeId: target.id, leaveTypeId: body.leaveTypeId, type: 'USE' },
        _sum: { amount: true },
      });
      const balance = computeLeaveBalance({
        policy: {
          accrualFrequency: policy.accrualFrequency,
          accrualAmount: policy.accrualAmount,
          accrualUnit: policy.accrualUnit === 'HOURS' ? 'HOURS' : 'DAYS',
          proRated: policy.proRated,
          carryoverLimit: policy.carryoverLimit,
          maxBalance: policy.maxBalance,
          anniversaryBasis: policy.anniversaryBasis,
        },
        joinDate: target.joiningDate ? target.joiningDate.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
        asOfDate: body.from,
        openingBalance: 0,
        usedSoFar: usedRows._sum.amount ?? 0,
      });
      const check = validateLeaveUsage({ balance: balance.remaining, requestedDays: days, policy: { accrualFrequency: policy.accrualFrequency, accrualAmount: policy.accrualAmount } });
      if (!check.ok) throw AppError.conflict(check.reason);
    }

    const request = await prisma.leaveRequest.create({
      data: {
        tenantId,
        employeeId: target.id,
        leaveTypeId: body.leaveTypeId,
        from: new Date(`${body.from}T00:00:00.000Z`),
        to: new Date(`${body.to}T23:59:59.999Z`),
        halfDay: body.halfDay,
        note: body.note,
        attachments: body.attachments as never,
      },
    });
    await writeAudit(req, { action: 'create', resourceType: 'leave_request', resourceId: request.id, after: { days, from: body.from, to: body.to } });
    reply.code(201).send({ data: request });
  });

  app.post('/leave/requests/:id/decide', async (req, reply) => {
    requirePermission('leave.approve')(req);
    const tenantId = requireTenantOfUser(req);
    const user = requireUser(req);
    const id = parseId(req);
    const body = (req.body ?? {}) as { decision?: 'APPROVED' | 'REJECTED'; note?: string };
    const decision = body.decision;
    if (decision !== 'APPROVED' && decision !== 'REJECTED') {
      throw AppError.validation('decision must be APPROVED or REJECTED');
    }
    const request = await prisma.leaveRequest.findFirst({ where: { id, tenantId } });
    if (!request) throw AppError.notFound('Leave request not found');

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.leaveRequest.update({
        where: { id },
        data: { status: decision, decidedBy: user.userId, decidedAt: new Date() },
      });
      await tx.leaveApproval.create({
        data: { tenantId, leaveRequestId: id, approverId: user.userId, status: decision, note: body.note },
      });
      if (decision === 'APPROVED') {
        const days = leaveDaysCount(request.from.toISOString().slice(0, 10), request.to.toISOString().slice(0, 10), request.halfDay);
        await tx.leaveTransaction.create({
          data: {
            tenantId,
            employeeId: request.employeeId,
            leaveTypeId: request.leaveTypeId,
            date: new Date(),
            amount: days,
            type: 'USE',
            reference: `leave_request:${id}`,
          },
        });
      }
      return next;
    });
    await writeAudit(req, { action: 'decide', resourceType: 'leave_request', resourceId: id, after: { decision: body.decision } });
    reply.send({ data: updated });
  });
}