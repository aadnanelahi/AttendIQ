# Glossary

Canonical domain terms used across TechSight Workforce Management documentation and code.

## Organizations and Structure
- **Tenant** — a self-contained customer organization; data is isolated per tenant.
- **Legal entity** — a company/entity owned by a tenant, with its own country and statutory context.
- **Branch / Location** — physical or organizational units; drive access restrictions and reporting filters.
- **Department** — organizational grouping of employees.
- **Designation** — role/title of an employee.
- **Manager** — employee who supervises other employees; acts as an approver.

## Workforce
- **Employee** — a person with a profile in the system (see docs/employee/EMPLOYEE_MANAGEMENT.md).
- **Employment status** — active, on-leave, suspended, terminated, rehired.
- **Roster** — planned assignment of employees to shifts over a period.

## Attendance
- **Transaction** — a raw punch/event from a device, mobile, or manual entry.
- **Device** — biometric/access hardware that produces transactions (see docs/devices/DEVICE_MANAGEMENT.md).
- **Attendance calculation** — deterministic conversion of validated transactions into attendance records (see docs/attendance/ATTENDANCE_CALCULATION.md).
- **Shift** — scheduled working hours for a day, including cross-midnight and flexible variants (see docs/attendance/SHIFT_MANAGEMENT.md).
- **Grace period** — tolerated lateness window before a late rule applies.
- **Late / Early rules** — thresholds that mark a punch as late or early-leaving.
- **Overtime** — eligible hours worked beyond assigned/legal limits (see docs/attendance/OVERTIME.md).
- **Absence** — expected-but-missing attendance for a scheduled shift.
- **Missing punch** — a shift with one side (in/out) of the punch pair absent.
- **Correction** — authorized adjustment to an attendance record; requires approval.

## Leave
- **Leave type** — configurable category (annual, sick, unpaid, etc.).
- **Leave policy** — accrual, carryover, and balance rules for a leave type.
- **Leave balance** — available entitlement per employee per leave type.
- **Leave application** — a request with an approval lifecycle (see docs/leave/LEAVE_MANAGEMENT.md).

## Payroll
- **Payroll period** — the work period a payroll run covers.
- **Salary components** — earnings/deductions that make up a salary structure.
- **Payslip** — the per-employee payroll output document.
- **WPS** — UAE Wage Protection System salary file (see docs/payroll/PAYROLL_COUNTRY_MODULES.md).
- **Payroll lock** — prevents edits to a period after it is approved.

## Access and Visitors
- **Door / Controller** — physical access point and its controller device.
- **Access group** — set of employees with the same access permissions.
- **Access event** — grant/deny occurrence at a door.
- **Visitor / Visit / Host** — visitor registration, visit record, and hosting employee (see docs/access/VISITOR_MANAGEMENT.md).

## Mobile and Location
- **Geofence** — geographic boundary used to validate mobile punches (see docs/mobile/GPS_ATTENDANCE.md).
- **GPS punch** — location-verified attendance transaction from the mobile app.

## Technical
- **RBAC** — role-based access control (see docs/api/RBAC.md).
- **Tenant isolation** — guaranteed separation of tenant data and processing (see docs/database/TENANT_ISOLATION.md).
- **Vendor adapter** — gateway that normalizes a hardware vendor's protocol (AGENTS.md #2).
- **Audit log** — immutable record of important mutations (see docs/security/AUDIT_LOGGING.md).
- **Webhook** — outbound callback for events sent to tenant integrations.
