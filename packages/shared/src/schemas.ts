import { z } from 'zod';
import { EMPLOYMENT_STATUSES } from './constants.js';

const id = z.string().uuid().or(z.string().min(1).max(64)).optional();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
export const isoDateTime = z.string().datetime({ offset: true });

export const page = z.coerce.number().int().min(1).default(1);
export const pageSize = z.coerce.number().int().min(1).max(200).default(20);
export const sortOrder = z.enum(['asc', 'desc']).default('asc');

export const listQuery = z.object({
  page,
  pageSize,
  sortBy: z.string().optional(),
  sortOrder,
  from: isoDate.optional(),
  to: isoDate.optional(),
  q: z.string().max(200).optional(),
});

export const idParam = z.object({ id: z.string().min(1) });

// --- Identity / auth ---
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});
export const refreshSchema = z.object({ refreshToken: z.string() });
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});
export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255),
  role: z.string().min(1),
  password: z.string().min(8).max(128).optional(),
  employeeId: id,
  branchId: id,
  departmentId: id,
});

// --- Org reference data ---
export const orgSchema = z.object({
  name: z.string().min(1).max(255),
  legalName: z.string().optional(),
  registrationNumber: z.string().optional(),
  taxNumber: z.string().optional(),
});
export const legalEntitySchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().min(1).max(255),
  country: z.string().optional(),
  legalForm: z.string().optional(),
  registrationNumber: z.string().optional(),
});
export const branchSchema = z.object({
  legalEntityId: z.string().min(1).optional(),
  name: z.string().min(1).max(255),
  code: z.string().max(50).optional(),
  address: z.string().optional(),
  timezone: z.string().default('UTC'),
});
export const departmentSchema = z.object({
  branchId: z.string().min(1).optional(),
  name: z.string().min(1).max(255),
  code: z.string().max(50).optional(),
});
export const locationSchema = z.object({
  branchId: z.string().min(1).optional(),
  name: z.string().min(1).max(255),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  radiusMeters: z.coerce.number().int().positive().optional(),
  address: z.string().optional(),
});

// --- Employees ---
export const employeeSchema = z.object({
  employeeNumber: z.string().min(1).max(50),
  firstName: z.string().min(1).max(255),
  lastName: z.string().min(1).max(255),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  birthDate: isoDate.optional(),
  nationality: z.string().optional(),
  departmentId: z.string().min(1).optional(),
  designation: z.string().max(255).optional(),
  locationId: z.string().min(1).optional(),
  branchId: z.string().min(1).optional(),
  managerId: z.string().min(1).optional(),
  employmentStatus: z.enum(EMPLOYMENT_STATUSES).default('ACTIVE'),
  joiningDate: isoDate.optional(),
  leavingDate: isoDate.optional(),
  deviceUserId: z.string().max(64).optional(),
});
export const employeeSalarySchema = z.object({
  employeeId: z.string().min(1),
  effectiveFrom: isoDate.optional(),
  currency: z.string().length(3).default('AED'),
  components: z
    .array(
      z.object({
        componentId: z.string().min(1),
        amount: z.coerce.number().min(0),
      }),
    )
    .min(1),
});

// --- Devices ---
export const deviceSchema = z.object({
  vendor: z.string().min(1),
  model: z.string().min(1),
  deviceId: z.string().min(1),
  serialNumber: z.string().optional(),
  ipAddress: z.string().optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  protocol: z.enum(['zktcp', 'http-push', 'zkcloud', 'mqtt']).default('zktcp'),
  credentialsRef: z.string().optional(),
  branchId: z.string().min(1).optional(),
  locationId: z.string().min(1).optional(),
});
export const deviceIngestSchema = z.object({
  deviceId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  transactions: z
    .array(
      z.object({
        userId: z.string().min(1),
        timestamp: z.string().datetime({ offset: true }),
        type: z.enum(['CHECK_IN', 'CHECK_OUT', 'UNKNOWN']).default('UNKNOWN'),
        raw: z.unknown().optional(),
      }),
    )
    .min(1)
    .max(1000),
});

// --- Attendance ---
export const manualPunchSchema = z.object({
  employeeId: z.string().min(1),
  timestamp: z.string().datetime({ offset: true }),
  type: z.enum(['CHECK_IN', 'CHECK_OUT']),
  reason: z.string().max(500).optional(),
});
export const attendanceAdjustmentSchema = z.object({
  attendanceDayId: z.string().min(1),
  checkIn: z.string().datetime({ offset: true }).nullable().optional(),
  checkOut: z.string().datetime({ offset: true }).nullable().optional(),
  note: z.string().min(1).max(1000),
  reason: z.string().max(2000).optional(),
});

// --- Shifts / rosters ---
const timePattern = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm');
export const shiftSchema = z.object({
  name: z.string().min(1).max(255),
  startTime: timePattern,
  endTime: timePattern,
  crossesMidnight: z.boolean().default(false),
  graceInMinutes: z.coerce.number().int().min(0).max(180).default(0),
  graceOutMinutes: z.coerce.number().int().min(0).max(180).default(0),
  breakMinutes: z.coerce.number().int().min(0).max(480).default(0),
  lateAllowedMinutes: z.coerce.number().int().min(0).max(600).default(0),
  earlyLeaveAllowedMinutes: z.coerce.number().int().min(0).max(600).default(0),
  requiredHoursMinutes: z.coerce.number().int().min(0).max(1440).optional(),
  isFlexible: z.boolean().default(false),
  isRotating: z.boolean().default(false),
  restDay: z.boolean().default(false),
});
export const holidaySchema = z.object({
  name: z.string().min(1).max(255),
  date: isoDate,
  paid: z.boolean().default(true),
  branchId: z.string().min(1).optional(),
});

// --- Leave ---
export const leaveTypeSchema = z.object({
  name: z.string().min(1).max(255),
  code: z.string().min(1).max(50),
  isPaid: z.boolean().default(true),
  requiresApproval: z.boolean().default(true),
  requiresAttachment: z.boolean().default(false),
  affectsAttendance: z.boolean().default(true),
});
export const leavePolicySchema = z.object({
  leaveTypeId: z.string().min(1),
  name: z.string().min(1).max(255),
  accrualFrequency: z.enum(['MONTHLY', 'YEARLY', 'SERVICE_YEAR']).default('MONTHLY'),
  accrualAmount: z.coerce.number().min(0),
  accrualUnit: z.enum(['DAYS', 'HOURS']).default('DAYS'),
  proRated: z.boolean().default(true),
  carryoverLimit: z.coerce.number().min(0).default(0),
  maxBalance: z.coerce.number().min(0).optional(),
  anniversaryBasis: z.boolean().default(false),
});
export const leaveRequestSchema = z.object({
  leaveTypeId: z.string().min(1),
  from: isoDate,
  to: isoDate,
  halfDay: z.boolean().default(false),
  note: z.string().max(2000).optional(),
  attachments: z.array(z.string().max(255)).default([]),
});

// --- Payroll ---
export const salaryComponentSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  type: z.enum(['EARNING', 'DEDUCTION']),
  isConfigurable: z.boolean().default(true),
  isStatutory: z.boolean().default(false),
  country: z.string().length(2).optional(),
});
export const payrollPeriodSchema = z.object({
  startDate: isoDate,
  endDate: isoDate,
  name: z.string().optional(),
  currency: z.string().length(3).default('AED'),
});

// --- Access / visitors ---
export const doorSchema = z.object({
  name: z.string().min(1).max(255),
  code: z.string().max(50).optional(),
  accessDeviceId: z.string().min(1).optional(),
  branchId: z.string().min(1).optional(),
});
export const accessGroupSchema = z.object({
  name: z.string().min(1).max(255),
  doorIds: z.array(z.string()).default([]),
});
export const visitorSchema = z.object({
  fullName: z.string().min(1).max(255),
  idType: z.string().optional(),
  idNumber: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
});
export const visitSchema = z.object({
  visitorId: z.string().min(1),
  hostId: z.string().min(1),
  purpose: z.string().min(1).max(500),
  scheduledAt: z.string().datetime({ offset: true }),
  notes: z.string().max(2000).optional(),
});

// --- Notifications ---
export const notificationDispatchSchema = z.object({
  channel: z.enum(['EMAIL', 'WHATSAPP']),
  templateCode: z.string().min(1),
  recipients: z.array(z.string().email()).min(1),
  variables: z.record(z.string()).default({}),
});

export type EmployeeInput = z.infer<typeof employeeSchema>;
export type ShiftInput = z.infer<typeof shiftSchema>;
export type DeviceInput = z.infer<typeof deviceSchema>;
export type LeaveRequestInput = z.infer<typeof leaveRequestSchema>;