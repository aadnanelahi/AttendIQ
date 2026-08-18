import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/db.js';
import { requirePermission, requireTenantOfUser } from '../plugins/auth.js';

export function registerReportRoutes(app: FastifyInstance): void {
  // --- Dashboard summary ---
  app.get('/reports/summary', async (req, reply) => {
    requirePermission('report.read')(req);
    const tenantId = requireTenantOfUser(req);
    const q = (req.query ?? {}) as { from?: string; to?: string };
    const from = new Date(`${q.from ?? '2000-01-01'}T00:00:00.000Z`);
    const to = new Date(`${q.to ?? '2999-12-31'}T23:59:59.999Z`);

    const [employees, devices, attendanceDays, pendingLeave, pendingAdjustments, pendingOvertime, pendingVisits] = await Promise.all([
      prisma.employee.count({ where: { tenantId } }),
      prisma.device.count({ where: { tenantId } }),
      prisma.attendanceDay.findMany({ where: { tenantId, date: { gte: from, lte: to } }, select: { status: true, lateMinutes: true, overtimeMinutes: true, workMinutes: true } }),
      prisma.leaveRequest.count({ where: { tenantId, status: 'PENDING' } }),
      prisma.attendanceAdjustment.count({ where: { tenantId, status: 'PENDING' } }),
      prisma.overtime.count({ where: { tenantId, status: 'PENDING' } }),
      prisma.visit.count({ where: { tenantId, status: 'SCHEDULED' } }),
    ]);

    const byStatus = new Map<string, number>();
    for (const d of attendanceDays) byStatus.set(d.status, (byStatus.get(d.status) ?? 0) + 1);
    const lateMinutes = attendanceDays.reduce((s, d) => s + d.lateMinutes, 0);
    const overtimeMinutes = attendanceDays.reduce((s, d) => s + d.overtimeMinutes, 0);

    reply.send({
      data: {
        counts: { employees, devices },
        attendance: { days: attendanceDays.length, byStatus: Object.fromEntries(byStatus), lateMinutes, overtimeMinutes },
        pending: { leave: pendingLeave, adjustments: pendingAdjustments, overtime: pendingOvertime, visits: pendingVisits },
      },
    });
  });

  // --- Attendance report ---
  app.get('/reports/attendance', async (req, reply) => {
    requirePermission('report.read')(req);
    const tenantId = requireTenantOfUser(req);
    const q = (req.query ?? {}) as { from?: string; to?: string; employeeId?: string };
    const from = new Date(`${q.from ?? '2000-01-01'}T00:00:00.000Z`);
    const to = new Date(`${q.to ?? '2999-12-31'}T23:59:59.999Z`);
    const where: Record<string, unknown> = { tenantId, date: { gte: from, lte: to } };
    if (q.employeeId) where.employeeId = q.employeeId;

    const days = await prisma.attendanceDay.findMany({
      where,
      include: { employee: { select: { id: true, employeeNumber: true, firstName: true, lastName: true, department: true } } },
      orderBy: { date: 'asc' },
    });

    const rows = days.map((d) => ({
      date: d.date.toISOString().slice(0, 10),
      employeeId: d.employeeId,
      employeeNumber: d.employee?.employeeNumber,
      name: d.employee ? `${d.employee.firstName} ${d.employee.lastName}` : '',
      departmentId: d.employee?.department?.id ?? undefined,
      status: d.status,
      checkIn: d.checkIn?.toISOString(),
      checkOut: d.checkOut?.toISOString(),
      workMinutes: d.workMinutes,
      requiredMinutes: d.requiredMinutes,
      lateMinutes: d.lateMinutes,
      earlyLeaveMinutes: d.earlyLeaveMinutes,
      overtimeMinutes: d.overtimeMinutes,
    }));

    const csv = toCsv(rows);
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', 'attachment; filename="attendance-report.csv"');
    reply.send(csv);
  });
}

type CsvRow = Record<string, string | number | undefined | null>;

function toCsv(rows: CsvRow[]): string {
  if (rows.length === 0) return 'date,employeeId,employeeNumber,name,departmentId,status,checkIn,checkOut,workMinutes,requiredMinutes,lateMinutes,earlyLeaveMinutes,overtimeMinutes\n';
  const headers = Object.keys(rows[0] as CsvRow);
  const escape = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines: string[] = [headers.join(',')];
  for (const r of rows) lines.push(headers.map((h) => escape(r[h])).join(','));
  return lines.join('\n');
}