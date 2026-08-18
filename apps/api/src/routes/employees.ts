import type { FastifyInstance } from 'fastify';
import { AppError, createUserSchema, employeeSalarySchema, employeeSchema } from '@attendiq/shared';
import { prisma, Prisma } from '../lib/db.js';
import { hashPassword } from '../lib/hashing.js';
import { writeAudit } from '../plugins/audit.js';
import { requirePermission, requireTenantOfUser } from '../plugins/auth.js';
import { parseId, parseListQuery, takeSkip } from '../lib/http.js';

const EMPLOYEE_INCLUDE = {
  department: true,
  branch: true,
  location: true,
  manager: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
  user: { select: { id: true, email: true, isActive: true } },
} as const;

function isoDateToDate(value?: string): Date | undefined {
  return value ? new Date(`${value}T00:00:00.000Z`) : undefined;
}

export function registerEmployeeRoutes(app: FastifyInstance): void {
  app.get('/employees', async (req, reply) => {
    requirePermission('employee.read')(req);
    const tenantId = requireTenantOfUser(req);
    const q = parseListQuery(req.query);
    const where: Prisma.EmployeeWhereInput = { tenantId };
    if (q.q) {
      where.OR = [
        { employeeNumber: { contains: q.q, mode: 'insensitive' } },
        { firstName: { contains: q.q, mode: 'insensitive' } },
        { lastName: { contains: q.q, mode: 'insensitive' } },
      ];
    }
    if (q.from || q.to) {
      where.joiningDate = {};
      if (q.from) where.joiningDate.gte = new Date(`${q.from}T00:00:00.000Z`);
      if (q.to) where.joiningDate.lte = new Date(`${q.to}T23:59:59.999Z`);
    }
    const [items, total] = await Promise.all([
      prisma.employee.findMany({ where, include: EMPLOYEE_INCLUDE, ...takeSkip(q), orderBy: { updatedAt: 'desc' } }),
      prisma.employee.count({ where }),
    ]);
    reply.send({ data: { items, page: q.page, pageSize: q.pageSize, total } });
  });

  app.get('/employees/:id', async (req, reply) => {
    requirePermission('employee.read')(req);
    const tenantId = requireTenantOfUser(req);
    const id = parseId(req);
    const employee = await prisma.employee.findUnique({ where: { id }, include: EMPLOYEE_INCLUDE });
    if (!employee || employee.tenantId !== tenantId) throw AppError.notFound('Employee not found');
    reply.send({ data: employee });
  });

  app.post('/employees', async (req, reply) => {
    requirePermission('employee.write')(req);
    const tenantId = requireTenantOfUser(req);
    const body = employeeSchema.parse(req.body);
    const { joiningDate, leavingDate, birthDate, ...rest } = body;
    const data = {
      tenantId,
      ...rest,
      birthDate: isoDateToDate(birthDate),
      joiningDate: isoDateToDate(joiningDate),
      leavingDate: isoDateToDate(leavingDate),
    };
    const employee = await prisma.employee.create({ data: data as never });
    await writeAudit(req, { action: 'create', resourceType: 'employee', resourceId: employee.id, after: { employeeNumber: employee.employeeNumber } });
    reply.code(201).send({ data: employee });
  });

  app.put('/employees/:id', async (req, reply) => {
    requirePermission('employee.write')(req);
    const tenantId = requireTenantOfUser(req);
    const id = parseId(req);
    const existing = await prisma.employee.findFirst({ where: { id, tenantId } });
    if (!existing) throw AppError.notFound('Employee not found');
    const body = employeeSchema.partial().parse(req.body);
    const { joiningDate, leavingDate, birthDate, ...rest } = body;
    const data = {
      ...rest,
      ...(birthDate !== undefined && { birthDate: isoDateToDate(birthDate) }),
      ...(joiningDate !== undefined && { joiningDate: isoDateToDate(joiningDate) }),
      ...(leavingDate !== undefined && { leavingDate: isoDateToDate(leavingDate) }),
    };
    const employee = await prisma.employee.update({ where: { id }, data: data as never });
    await writeAudit(req, { action: 'update', resourceType: 'employee', resourceId: id, before: { employmentStatus: existing.employmentStatus }, after: { employmentStatus: employee.employmentStatus } });
    reply.send({ data: employee });
  });

  app.delete('/employees/:id', async (req, reply) => {
    requirePermission('employee.delete')(req);
    const tenantId = requireTenantOfUser(req);
    const id = parseId(req);
    const existing = await prisma.employee.findFirst({ where: { id, tenantId } });
    if (!existing) throw AppError.notFound('Employee not found');
    await prisma.employee.delete({ where: { id } });
    await writeAudit(req, { action: 'delete', resourceType: 'employee', resourceId: id, before: { employeeNumber: existing.employeeNumber } });
    reply.code(204).send();
  });

  // --- Salary ---
  app.get('/employees/:id/salary', async (req, reply) => {
    requirePermission('employee.salary.read')(req);
    const tenantId = requireTenantOfUser(req);
    const id = parseId(req);
    const employee = await prisma.employee.findFirst({ where: { id, tenantId } });
    if (!employee) throw AppError.notFound('Employee not found');
    const salary = await prisma.employeeSalary.findMany({
      where: { employeeId: id },
      include: { structure: { include: { components: true } } },
      orderBy: { effectiveFrom: 'desc' },
    });
    reply.send({ data: salary });
  });

  app.post('/employees/:id/salary', async (req, reply) => {
    requirePermission('employee.salary.write')(req);
    const tenantId = requireTenantOfUser(req);
    const id = parseId(req);
    const employee = await prisma.employee.findFirst({ where: { id, tenantId } });
    if (!employee) throw AppError.notFound('Employee not found');
    const body = employeeSalarySchema.parse({ ...(req.body as object), employeeId: id });
    const salary = await prisma.$transaction(async (tx) => {
      await tx.employeeSalary.updateMany({ where: { employeeId: id, active: true }, data: { active: false } });
      return tx.employeeSalary.create({
        data: {
          tenantId,
          employeeId: id,
          effectiveFrom: body.effectiveFrom ? new Date(`${body.effectiveFrom}T00:00:00.000Z`) : new Date(),
          components: body.components as never,
          currency: body.currency,
        },
      });
    });
    await writeAudit(req, { action: 'update_salary', resourceType: 'employee_salary', resourceId: salary.id, after: { components: salary.components } });
    reply.code(201).send({ data: salary });
  });

  // --- Biometrics (metadata only; templates are never exposed) ---
  app.get('/employees/:id/biometrics', async (req, reply) => {
    requirePermission('employee.read')(req);
    const tenantId = requireTenantOfUser(req);
    const id = parseId(req);
    const employee = await prisma.employee.findFirst({ where: { id, tenantId } });
    if (!employee) throw AppError.notFound('Employee not found');
    const biometrics = await prisma.biometricIdentifier.findMany({
      where: { employeeId: id },
      select: { id: true, type: true, enrolledAt: true, deviceId: true },
    });
    reply.send({ data: biometrics });
  });

  // --- Login user for an employee ---
  app.post('/employees/:id/user', async (req, reply) => {
    requirePermission('user.write')(req);
    const tenantId = requireTenantOfUser(req);
    const id = parseId(req);
    const employee = await prisma.employee.findFirst({ where: { id, tenantId } });
    if (!employee) throw AppError.notFound('Employee not found');
    const body = createUserSchema.parse({ ...(req.body as object), employeeId: id, tenantId: undefined });
    const role = await prisma.role.findFirst({ where: { tenantId, code: body.role } });
    if (!role) throw AppError.validation(`Unknown role ${body.role}`);
    const passwordHash = await hashPassword(body.password ?? 'ChangeMe123!');
    const user = await prisma.user.create({
      data: {
        tenantId,
        email: body.email.toLowerCase(),
        passwordHash,
        name: body.name,
        employee: { connect: { id } },
      },
    });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    await writeAudit(req, { action: 'create', resourceType: 'user', resourceId: user.id, after: { email: user.email, role: role.code } });
    reply.code(201).send({ data: { id: user.id, email: user.email, name: user.name, role: role.code } });
  });
}