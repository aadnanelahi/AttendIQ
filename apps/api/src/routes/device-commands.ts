import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '@attendiq/shared';
import { prisma } from '../lib/db.js';
import { writeAudit } from '../plugins/audit.js';
import { requirePermission, requireTenantOfUser } from '../plugins/auth.js';
import { parseId } from '../lib/http.js';
import { ADMS_PROTOCOL, eligibleDevicesForEmployee, queueCommand, queueEmployeeToDevice } from '../modules/adms.js';

const enrollSchema = z.object({
  deviceId: z.string().min(1),
  fingerIndex: z.coerce.number().int().min(0).max(9).default(0),
});

const pushSchema = z.object({
  deviceIds: z.array(z.string().min(1)).optional(),
});

const COMMAND_SELECT = {
  id: true,
  kind: true,
  status: true,
  employeeId: true,
  fingerIndex: true,
  returnCode: true,
  error: true,
  createdAt: true,
  sentAt: true,
  completedAt: true,
  deviceId: true,
} as const;

async function loadEmployee(tenantId: string, id: string) {
  const employee = await prisma.employee.findFirst({ where: { id, tenantId } });
  if (!employee) throw AppError.notFound('Employee not found');
  if (!employee.deviceUserId?.trim()) {
    throw AppError.validation('Set a Device user ID for this employee first', { deviceUserId: 'Required to send to devices' });
  }
  return employee;
}

export function registerDeviceCommandRoutes(app: FastifyInstance): void {
  // ----- Per device -----

  app.get('/devices/:id/commands', async (req, reply) => {
    requirePermission('device.read')(req);
    const tenantId = requireTenantOfUser(req);
    const id = parseId(req);
    const device = await prisma.device.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!device) throw AppError.notFound('Device not found');
    const [items, pending] = await Promise.all([
      prisma.deviceCommand.findMany({ where: { deviceId: id, tenantId }, orderBy: { id: 'desc' }, take: 100, select: COMMAND_SELECT }),
      prisma.deviceCommand.count({ where: { deviceId: id, tenantId, status: 'PENDING' } }),
    ]);
    const employeeIds = [...new Set(items.map((c) => c.employeeId).filter((x): x is string => !!x))];
    const employees = await prisma.employee.findMany({
      where: { id: { in: employeeIds }, tenantId },
      select: { id: true, firstName: true, lastName: true, deviceUserId: true },
    });
    reply.send({ data: { items, pending, employees } });
  });

  // Queue every active employee with a Device user ID (and their stored templates).
  app.post('/devices/:id/sync-employees', async (req, reply) => {
    requirePermission('device.write')(req);
    const tenantId = requireTenantOfUser(req);
    const id = parseId(req);
    const device = await prisma.device.findFirst({ where: { id, tenantId } });
    if (!device) throw AppError.notFound('Device not found');
    if (device.protocol !== ADMS_PROTOCOL) throw AppError.validation('Only ADMS (http-push) devices can receive employees');
    const employees = await prisma.employee.findMany({
      where: {
        tenantId,
        deviceUserId: { not: null },
        employmentStatus: { in: ['ACTIVE', 'ON_LEAVE'] },
        ...(device.branchId ? { OR: [{ branchId: null }, { branchId: device.branchId }] } : {}),
      },
      select: { id: true, tenantId: true, deviceUserId: true },
    });
    let queued = 0;
    let employeesQueued = 0;
    for (const e of employees) {
      if (!e.deviceUserId?.trim()) continue;
      queued += await queueEmployeeToDevice(e, device, true);
      employeesQueued++;
    }
    await writeAudit(req, { action: 'adms_sync_employees', resourceType: 'device', resourceId: id, after: { employees: employeesQueued, commands: queued } });
    reply.send({ data: { employees: employeesQueued, commands: queued } });
  });

  // ----- Per employee -----

  app.get('/employees/:id/device-commands', async (req, reply) => {
    requirePermission('employee.read')(req);
    const tenantId = requireTenantOfUser(req);
    const id = parseId(req);
    const items = await prisma.deviceCommand.findMany({
      where: { tenantId, employeeId: id },
      orderBy: { id: 'desc' },
      take: 30,
      select: { ...COMMAND_SELECT, device: { select: { deviceId: true, model: true } } },
    });
    reply.send({ data: items });
  });

  app.post('/employees/:id/push-to-devices', async (req, reply) => {
    requirePermission('device.write')(req);
    const tenantId = requireTenantOfUser(req);
    const id = parseId(req);
    const body = pushSchema.parse(req.body ?? {});
    const employee = await loadEmployee(tenantId, id);
    let devices = await eligibleDevicesForEmployee(tenantId, employee.branchId);
    if (body.deviceIds?.length) devices = devices.filter((d) => body.deviceIds!.includes(d.id));
    let queued = 0;
    for (const d of devices) queued += await queueEmployeeToDevice(employee, d, true);
    await writeAudit(req, { action: 'adms_push_employee', resourceType: 'employee', resourceId: id, after: { devices: devices.length, commands: queued } });
    reply.send({ data: { devices: devices.length, commands: queued } });
  });

  app.post('/employees/:id/remove-from-devices', async (req, reply) => {
    requirePermission('device.write')(req);
    const tenantId = requireTenantOfUser(req);
    const id = parseId(req);
    const employee = await loadEmployee(tenantId, id);
    const devices = await prisma.device.findMany({ where: { tenantId, protocol: ADMS_PROTOCOL, isActive: true } });
    // Cancel anything still waiting for this employee, then queue the delete.
    await prisma.deviceCommand.updateMany({
      where: { tenantId, employeeId: id, status: 'PENDING' },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });
    for (const d of devices) await queueCommand({ tenantId, deviceId: d.id, kind: 'DELETE_USER', employeeId: employee.id });
    await writeAudit(req, { action: 'adms_remove_employee', resourceType: 'employee', resourceId: id, after: { devices: devices.length } });
    reply.send({ data: { devices: devices.length } });
  });

  // Puts the device into fingerprint-enrollment mode for this employee.
  app.post('/employees/:id/enroll-fingerprint', async (req, reply) => {
    requirePermission('device.write')(req);
    const tenantId = requireTenantOfUser(req);
    const id = parseId(req);
    const body = enrollSchema.parse(req.body ?? {});
    const employee = await loadEmployee(tenantId, id);
    const device = await prisma.device.findFirst({ where: { id: body.deviceId, tenantId, protocol: ADMS_PROTOCOL, isActive: true } });
    if (!device) throw AppError.validation('Choose an active ADMS device', { deviceId: 'Not found' });
    // The user must exist on the device before enrolling.
    await queueEmployeeToDevice(employee, device, false);
    const cmd = await queueCommand({ tenantId, deviceId: device.id, kind: 'ENROLL', employeeId: employee.id, fingerIndex: body.fingerIndex });
    await writeAudit(req, { action: 'adms_enroll_fingerprint', resourceType: 'employee', resourceId: id, after: { deviceId: device.deviceId, fingerIndex: body.fingerIndex } });
    reply.code(201).send({ data: { commandId: cmd.id } });
  });

  app.delete('/employees/:id/biometrics/:biometricId', async (req, reply) => {
    requirePermission('employee.write')(req);
    const tenantId = requireTenantOfUser(req);
    const id = parseId(req);
    const { biometricId } = req.params as { biometricId: string };
    const bio = await prisma.biometricIdentifier.findFirst({ where: { id: biometricId, employeeId: id, tenantId } });
    if (!bio) throw AppError.notFound('Template not found');
    await prisma.deviceCommand.updateMany({
      where: { tenantId, biometricId, status: 'PENDING' },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });
    await prisma.biometricIdentifier.delete({ where: { id: bio.id } });
    await writeAudit(req, { action: 'delete_biometric', resourceType: 'employee', resourceId: id, before: { type: bio.type, fingerIndex: bio.fingerIndex } });
    reply.code(204).send();
  });
}
