# Leave Management

## Purpose
Configurable leave types, balances, accrual rules, applications, approvals, cancellations, attachments, and reporting, per PRODUCT_REQUIREMENTS.md §3 and FUNCTIONAL_REQUIREMENTS.md.

## Domain Model
- **LeaveType** — tenant-configurable, e.g. annual, sick, unpaid, parental, study, compassionate.
  - Paid/unpaid flag
  - Requires approval or self-service with auto-approval
  - Attachments required flag
  - Affects attendance/absence flag
  - Country-specific defaults shipped as data, never hardcoded into the engine
- **LeavePolicy** — accrual, carryover, and balance rules for a leave type:
  - Accrual frequency (monthly, yearly, per service year)
  - Accrual rate (fixed or tenure-based/pro-rata)
  - Carryover limit and expiry
  - Entitlement cap and minimum balance
  - Anniversary vs calendar-year basis
- **LeaveBalance** — per employee per leave type; opening balance plus accruals minus approved deductions.
- **LeaveApplication** — submitted by employee, approved/rejected by manager and/or HR, cancelled or withdrawn.

## Application Workflow
- States: Draft -> Submitted -> Approved / Rejected, and Cancelled / Withdrawn after approval.
- Branch/location restrictions apply to approvers per RBAC (docs/api/RBAC.md).
- Approval notifications via the notification engine (docs/notifications/NOTIFICATION_ENGINE.md).
- Employee can attach supporting documents; attachments are tenant-scoped and access-controlled.
- Approved leave feeds attendance calculation so approved leave days are not counted as absence and affect leave-impacted payroll.

## Accrual Rules
- Accrual must be deterministic and independently testable (AGENTS.md #9/#10).
- Compute accrual only for dates on/after hire date; stop after leaving date.
- Support pro-rating for mid-period joins and policy changes.
- Recompute on policy change in a way that is auditable and reversible via audit log (docs/security/AUDIT_LOGGING.md).

## Payroll Impact
- Approved leave hours/days flow into payroll as inputs (docs/payroll/PAYROLL.md).
- Unpaid leave reduces payable days; paid leave maps to leave salary components.
- Leave encashment/settlement on exit is a payroll component, not a leave engine responsibility.

## Mobile and Self-Service
- Apply, view balances, check history, cancel, and upload attachments from mobile (docs/mobile/MOBILE_APP.md).
- Managers approve from mobile; notifications on every state change.

## Reporting
- Leave taken by type/period, balances, accrual projections, pending approvals, and leave calendar.
- All reports support tenant-aware filtering, date ranges, branch/department/location filters, role restrictions, export, and auditability.

## Cross-Cutting
- Strict tenant isolation (docs/database/TENANT_ISOLATION.md).
- All state transitions are audited.
- Localized labels and RTL support (docs/localization/LOCALIZATION.md).
