import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError, payrollPeriodSchema, salaryComponentSchema } from '@attendiq/shared';
import { calculatePayrollRow, type SalaryComponentDefinition } from '@attendiq/core';
import { prisma } from '../lib/db.js';
import { writeAudit } from '../plugins/audit.js';
import { requirePermission, requireTenantOfUser, requireUser } from '../plugins/auth.js';
import { parseId, parseListQuery, takeSkip } from '../lib/http.js';

const structureSchema = z.object({
  name: z.string().min(1).max(255),
  currency: z.string().length(3).default('AED'),
  components: z.array(salaryComponentSchema).default([]),
});

const adjustmentSchema = z.object({
  employeeId: z.string().min(1),
  amount: z.coerce.number(),
  type: z.enum(['EARNING', 'DEDUCTION']),
  note: z.string().max(2000).optional(),
});

interface StoredComponent {
  componentId?: string;
  id?: string;
  code?: string;
  type?: 'EARNING' | 'DEDUCTION' | string;
  amount: number;
}

function resolveSalaryComponents(
  salary: { components?: unknown; structure?: { components: { id: string; code: string; type: string; defaultAmount: number }[] } | null } | null | undefined,
  componentById: Map<string, { code: string; type: string; isStatutory: boolean }>,
): SalaryComponentDefinition[] {
  if (salary && Array.isArray(salary.components)) {
    const stored = salary.components as StoredComponent[];
    const resolved: (SalaryComponentDefinition | null)[] = stored.map((c) => {
      if (c.componentId) {
        const def = componentById.get(c.componentId);
        if (!def) return null;
        return { id: c.componentId, code: def.code, type: def.type === 'DEDUCTION' ? 'DEDUCTION' : 'EARNING', isStatutory: def.isStatutory, amount: c.amount };
      }
      return {
        id: c.id ?? c.code ?? 'COMPONENT',
        code: c.code ?? 'COMPONENT',
        type: c.type === 'DEDUCTION' ? 'DEDUCTION' : 'EARNING',
        amount: c.amount,
      };
    });
    const filtered = resolved.filter((c): c is SalaryComponentDefinition => c !== null);
    if (filtered.length) return filtered;
  }
  return (salary?.structure?.components ?? []).map((c) => ({
    id: c.id,
    code: c.code,
    type: c.type === 'DEDUCTION' ? 'DEDUCTION' : 'EARNING',
    amount: c.defaultAmount,
  }));
}

function toCsv(rows: (string | number)[][]): string {
  return rows.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
}

export function registerPayrollRoutes(app: FastifyInstance): void {
  // --- Salary structures ---
  app.get('/payroll/structures', async (req, reply) => {
    requirePermission('payroll.read')(req);
    const tenantId = requireTenantOfUser(req);
    const structures = await prisma.salaryStructure.findMany({
      where: { tenantId },
      include: { components: true },
      orderBy: { createdAt: 'desc' },
    });
    reply.send({ data: structures });
  });

  app.post('/payroll/structures', async (req, reply) => {
    requirePermission('payroll.write')(req);
    const tenantId = requireTenantOfUser(req);
    const body = structureSchema.parse(req.body);
    const structure = await prisma.salaryStructure.create({
      data: {
        tenantId,
        name: body.name,
        currency: body.currency,
        components: {
          create: body.components.map((c) => ({ ...c, tenantId })),
        },
      },
      include: { components: true },
    });
    await writeAudit(req, { action: 'create', resourceType: 'salary_structure', resourceId: structure.id });
    reply.code(201).send({ data: structure });
  });

  app.put('/payroll/structures/:id', async (req, reply) => {
    requirePermission('payroll.write')(req);
    const tenantId = requireTenantOfUser(req);
    const id = parseId(req);
    const existing = await prisma.salaryStructure.findFirst({ where: { id, tenantId } });
    if (!existing) throw AppError.notFound('Salary structure not found');
    const body = z.object({ name: z.string().min(1).max(255).optional(), currency: z.string().length(3).optional() }).parse(req.body);
    const updated = await prisma.salaryStructure.update({ where: { id }, data: body, include: { components: true } });
    await writeAudit(req, { action: 'update', resourceType: 'salary_structure', resourceId: id });
    reply.send({ data: updated });
  });

  app.delete('/payroll/structures/:id', async (req, reply) => {
    requirePermission('payroll.write')(req);
    const tenantId = requireTenantOfUser(req);
    const id = parseId(req);
    const existing = await prisma.salaryStructure.findFirst({ where: { id, tenantId } });
    if (!existing) throw AppError.notFound('Salary structure not found');
    await prisma.salaryStructure.delete({ where: { id } });
    await writeAudit(req, { action: 'delete', resourceType: 'salary_structure', resourceId: id });
    reply.code(204).send();
  });

  // --- Salary components ---
  app.get('/payroll/components', async (req, reply) => {
    requirePermission('payroll.read')(req);
    const tenantId = requireTenantOfUser(req);
    const components = await prisma.salaryComponent.findMany({ where: { tenantId }, orderBy: { code: 'asc' } });
    reply.send({ data: components });
  });

  const componentCreate = salaryComponentSchema.extend({ structureId: z.string().optional() });
  app.post('/payroll/components', async (req, reply) => {
    requirePermission('payroll.write')(req);
    const tenantId = requireTenantOfUser(req);
    const body = componentCreate.parse(req.body);
    const row = await prisma.salaryComponent.create({ data: { ...body, tenantId } });
    await writeAudit(req, { action: 'create', resourceType: 'salary_component', resourceId: row.id });
    reply.code(201).send({ data: row });
  });

  app.delete('/payroll/components/:id', async (req, reply) => {
    requirePermission('payroll.write')(req);
    const tenantId = requireTenantOfUser(req);
    const id = parseId(req);
    const existing = await prisma.salaryComponent.findFirst({ where: { id, tenantId } });
    if (!existing) throw AppError.notFound('Salary component not found');
    await prisma.salaryComponent.delete({ where: { id } });
    await writeAudit(req, { action: 'delete', resourceType: 'salary_component', resourceId: id });
    reply.code(204).send();
  });

  // --- Payroll periods ---
  app.get('/payroll/periods', async (req, reply) => {
    requirePermission('payroll.read')(req);
    const tenantId = requireTenantOfUser(req);
    const q = parseListQuery(req.query);
    const [items, total] = await Promise.all([
      prisma.payrollPeriod.findMany({ where: { tenantId }, ...takeSkip(q), orderBy: { startDate: 'desc' } }),
      prisma.payrollPeriod.count({ where: { tenantId } }),
    ]);
    reply.send({ data: { items, page: q.page, pageSize: q.pageSize, total } });
  });

  app.post('/payroll/periods', async (req, reply) => {
    requirePermission('payroll.write')(req);
    const tenantId = requireTenantOfUser(req);
    const body = payrollPeriodSchema.parse(req.body);
    const period = await prisma.payrollPeriod.create({
      data: {
        tenantId,
        name: body.name ?? `${body.startDate}..${body.endDate}`,
        startDate: new Date(`${body.startDate}T00:00:00.000Z`),
        endDate: new Date(`${body.endDate}T23:59:59.999Z`),
        currency: body.currency,
      },
    });
    await writeAudit(req, { action: 'create', resourceType: 'payroll_period', resourceId: period.id });
    reply.code(201).send({ data: period });
  });

  app.post('/payroll/periods/:id/lock', async (req, reply) => {
    requirePermission('payroll.lock')(req);
    const tenantId = requireTenantOfUser(req);
    const id = parseId(req);
    const existing = await prisma.payrollPeriod.findFirst({ where: { id, tenantId } });
    if (!existing) throw AppError.notFound('Payroll period not found');
    const updated = await prisma.payrollPeriod.update({ where: { id }, data: { status: 'CLOSED' } });
    await writeAudit(req, { action: 'lock', resourceType: 'payroll_period', resourceId: id });
    reply.send({ data: updated });
  });

  // --- Payroll run ---
  app.get('/payroll/runs', async (req, reply) => {
    requirePermission('payroll.read')(req);
    const tenantId = requireTenantOfUser(req);
    const runs = await prisma.payrollRun.findMany({
      where: { tenantId },
      include: { period: true, _count: { select: { items: true } } },
      orderBy: { startedAt: 'desc' },
    });
    reply.send({ data: runs });
  });

  app.get('/payroll/runs/:id', async (req, reply) => {
    requirePermission('payroll.read')(req);
    const tenantId = requireTenantOfUser(req);
    const id = parseId(req);
    const run = await prisma.payrollRun.findFirst({
      where: { id, tenantId },
      include: {
        period: true,
        items: { include: { employee: { select: { id: true, employeeNumber: true, firstName: true, lastName: true } } } },
        adjustments: true,
        payslips: true,
      },
    });
    if (!run) throw AppError.notFound('Payroll run not found');
    reply.send({ data: run });
  });

  app.post('/payroll/runs', async (req, reply) => {
    requirePermission('payroll.run')(req);
    const tenantId = requireTenantOfUser(req);
    const user = requireUser(req);
    const body = (req.body ?? {}) as { periodId?: string };
    if (!body.periodId) throw AppError.validation('periodId is required');
    const period = await prisma.payrollPeriod.findFirst({ where: { id: body.periodId, tenantId } });
    if (!period) throw AppError.notFound('Payroll period not found');

    const employees = await prisma.employee.findMany({
      where: { tenantId, employmentStatus: { in: ['ACTIVE', 'ON_LEAVE', 'SUSPENDED'] } },
      include: { salary: { where: { active: true }, include: { structure: { include: { components: true } } } } },
    });

    const start = period.startDate;
    const end = period.endDate;

    // Aggregated attendance for the whole tenant period.
    const attendanceDays = await prisma.attendanceDay.findMany({ where: { tenantId, date: { gte: start, lte: end }, status: { in: ['PRESENT', 'LATE', 'ABSENT', 'LEAVE', 'REST_DAY', 'HOLIDAY', 'NO_DATA'] } } });
    const leaveTxns = await prisma.leaveTransaction.findMany({ where: { tenantId, date: { gte: start, lte: end }, type: 'USE' } });
    const paidLeaveTypeIds = new Set((await prisma.leaveType.findMany({ where: { tenantId, isPaid: true } })).map((t) => t.id));
    const componentById = new Map(
      (await prisma.salaryComponent.findMany({ where: { tenantId } })).map((c) => [c.id, { code: c.code, type: c.type, isStatutory: c.isStatutory }]),
    );

    const run = await prisma.payrollRun.create({
      data: { tenantId, periodId: period.id, status: 'DRAFT', triggeredBy: user.userId, ruleVersion: 'payroll-engine-v1' },
    });

    const items: object[] = [];
    const errors: object[] = [];

    for (const employee of employees) {
      try {
        const dayRows = attendanceDays.filter((d) => d.employeeId === employee.id);
        const present = dayRows.filter((d) => d.status === 'PRESENT' || d.status === 'LATE').length;
        const leaveDays = dayRows.filter((d) => d.status === 'LEAVE');
        const leavePaid = leaveDays.filter((d) => paidLeaveTypeIds.has(String((d.exceptions as { leaveTypeId?: string } | null)?.leaveTypeId))).length;
        const leaveUnpaid = leaveDays.length - leavePaid;
        const absence = dayRows.filter((d) => d.status === 'ABSENT' || d.status === 'NO_DATA').length;
        const overtimeMinutes = dayRows.reduce((s, d) => s + d.overtimeMinutes, 0);

const salary = employee.salary[0];
    const components = resolveSalaryComponents(salary, componentById);

        const overtimeApprovedMinutes = (await prisma.overtime.aggregate({
          where: { tenantId, employeeId: employee.id, date: { gte: start, lte: end }, status: 'APPROVED' },
          _sum: { minutes: true },
        }))._sum.minutes ?? 0;

        const result = calculatePayrollRow({
          components,
          attendance: { workingDays: 26, presentDays: present, leavePaidDays: leavePaid, leaveUnpaidDays: leaveUnpaid, absenceDays: absence, overtimeMinutes },
          overtime: { approvedHours: 0, minutes: overtimeApprovedMinutes },
          policy: {},
        });

        const item = await prisma.payrollItem.create({
          data: {
            tenantId, runId: run.id, employeeId: employee.id,
            gross: result.gross, net: result.net,
            totals: result.breakdown as never,
            attendanceSummary: { present, leavePaid, leaveUnpaid, absence, overtimeMinutes },
            overtimeSummary: { approvedMinutes: overtimeApprovedMinutes },
            leaveSummary: { paid: leavePaid, unpaid: leaveUnpaid },
          },
        });
        items.push(item);
      } catch (err) {
        errors.push({ employeeId: employee.id, message: err instanceof Error ? err.message : 'unknown error' });
      }
    }

    const payslips: object[] = [];
    for (const item of items) {
      const it = item as { id: string; employeeId: string; gross: number; net: number; totals: unknown };
      const existing = await prisma.payslip.findFirst({ where: { runId: run.id, employeeId: it.employeeId } });
      if (existing) continue;
      const slip = await prisma.payslip.create({
        data: { tenantId, runId: run.id, periodId: period.id, employeeId: it.employeeId, gross: it.gross, net: it.net, components: it.totals as never },
      });
      payslips.push(slip);
    }

    const grossTotal = items.reduce((s, i) => s + (i as { gross: number }).gross, 0);
    const netTotal = items.reduce((s, i) => s + (i as { net: number }).net, 0);
    await prisma.payrollRun.update({
      where: { id: run.id },
      data: { status: 'DRAFT', completedAt: new Date(), totals: { gross: grossTotal, net: netTotal, count: items.length }, errors: errors.length ? (errors as unknown as object) : undefined },
    });

    await writeAudit(req, { action: 'run', resourceType: 'payroll_run', resourceId: run.id, after: { gross: grossTotal, net: netTotal, count: items.length, errors: errors.length, payslips: payslips.length } });
    reply.code(201).send({ data: { run, items: items.length, payslips: payslips.length, errors } });
  });

  // --- Run adjustments ---
  app.post('/payroll/runs/:id/adjustments', async (req, reply) => {
    requirePermission('payroll.write')(req);
    const tenantId = requireTenantOfUser(req);
    const id = parseId(req);
    const body = adjustmentSchema.parse(req.body);
    const run = await prisma.payrollRun.findFirst({ where: { id, tenantId } });
    if (!run) throw AppError.notFound('Payroll run not found');
    const row = await prisma.payrollAdjustment.create({
      data: { tenantId, runId: id, employeeId: body.employeeId, amount: body.amount, type: body.type, note: body.note },
    });
    await writeAudit(req, { action: 'create', resourceType: 'payroll_adjustment', resourceId: row.id });
    reply.code(201).send({ data: row });
  });

  // --- Payslips ---
  app.get('/payroll/payslips', async (req, reply) => {
    requirePermission('payroll.read')(req);
    const tenantId = requireTenantOfUser(req);
    const q = parseListQuery(req.query);
    const [items, total] = await Promise.all([
      prisma.payslip.findMany({
        where: { tenantId },
        include: { period: true },
        ...takeSkip(q),
        orderBy: { issuedAt: 'desc' },
      }),
      prisma.payslip.count({ where: { tenantId } }),
    ]);
    reply.send({ data: { items, page: q.page, pageSize: q.pageSize, total } });
  });

  // --- Export (CSV generation) ---
  app.post('/payroll/runs/:id/export', async (req, reply) => {
    requirePermission('payroll.export')(req);
    const tenantId = requireTenantOfUser(req);
    const user = requireUser(req);
    const id = parseId(req);
    const body = (req.body ?? {}) as { format?: string; country?: string };
    const run = await prisma.payrollRun.findFirst({
      where: { id, tenantId },
      include: { period: true, items: { include: { employee: { select: { employeeNumber: true, firstName: true, lastName: true } } } } },
    });
    if (!run) throw AppError.notFound('Payroll run not found');
    const rows: (string | number)[][] = [
      ['employeeNumber', 'firstName', 'lastName', 'gross', 'net'],
      ...run.items.map((item) => [
        item.employee.employeeNumber,
        item.employee.firstName,
        item.employee.lastName,
        item.gross,
        item.net,
      ]),
    ];
    const content = toCsv(rows);
    const row = await prisma.payrollExport.create({
      data: { tenantId, runId: id, format: body.format ?? 'CSV', country: body.country, generatedBy: user.userId, status: 'GENERATED', storageKey: `csv:${Buffer.from(content).toString('base64')}` },
    });
    await writeAudit(req, { action: 'export', resourceType: 'payroll_export', resourceId: row.id, after: { format: row.format, items: run.items.length } });
    reply.code(201).send({ data: { id: row.id, format: row.format, status: row.status, items: run.items.length, csv: content } });
  });
}