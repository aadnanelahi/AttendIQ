# Overtime

## Purpose
Overtime rules, calculation, approval, and downstream consumption per FUNCTIONAL_REQUIREMENTS.md (Overtime) and PRODUCT_REQUIREMENTS.md §2/§8.

## Definitions
- **Overtime** — work hours beyond the assigned shift or weekly/legal limits, computed from approved attendance.
- **Eligibility** — overtime applies only to eligible employees per employment type, designation, and country rules.

## Overtime Types
- Pre-shift and post-shift overtime.
- Weekly excess beyond contractual weekly hours.
- Weekend and public-holiday work.
- Night premium where applicable (country module config, docs/payroll/PAYROLL_COUNTRY_MODULES.md).

## Rules and Configuration
- Multiplier per overtime type (e.g. 1.25x / 1.5x / 2x), configurable per tenant/policy.
- Minimum block size (e.g. only count full 30-minute blocks).
- Caps per day/week/month.
- Approval required flag; overtime is locked into payroll only after approval (docs/payroll/PAYROLL.md).
- Interaction with flexible shifts: only hours beyond the scheduled/expected band count.
- Interaction with leave: approved leave days produce no overtime.

## Calculation
- Attendance engine produces raw eligible hours (docs/attendance/ATTENDANCE_CALCULATION.md); overtime is a deterministic transformation of approved attendance.
- Output: overtime hours per type per payroll period, plus monetary value when a rate is configured.
- Must be deterministic and testable (AGENTS.md #9); property tests for rounding, caps, and midnight boundaries.

## Mobile and Corrections
- Mobile: view overtime, request approval, submit corrections (docs/mobile/MOBILE_APP.md).
- Manual correction workflow and approvals feed the same overtime pipeline.

## Reporting
- Overtime by employee/department/branch, hours vs approved vs paid, cost summaries, and trend analysis (docs/reports/REPORTING_ENGINE.md).
- AI insights and anomaly detection operate on overtime data within tenant and role permissions (docs/ai/AI_WORKFORCE_PLATFORM.md).

## Related
- Shift and roster definitions: docs/attendance/SHIFT_MANAGEMENT.md
- Payroll consumption: docs/payroll/PAYROLL.md
