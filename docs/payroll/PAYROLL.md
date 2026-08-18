# TechSight Payroll Engine — Detailed Specification

## 1. Objective
Convert approved workforce and compensation inputs into auditable payroll results.

## 2. Payroll Lifecycle
Draft → Calculate → Validate → Review → Approve → Lock → Publish/Export.

## 3. Inputs
- Employee salary
- Salary components
- Allowances
- Deductions
- Attendance
- Overtime
- Leave
- Absence
- Adjustments
- Loans/advances if enabled
- Country-specific rules

## 4. Calculation
Every payroll item must record:
- source
- calculation basis
- amount
- rule/version
- effective date

## 5. Payroll Lock
A locked payroll run cannot be silently modified. Corrections require an explicit adjustment/reversal workflow.

## 6. Payslips
Payslips should contain configurable employee/pay-period information and a breakdown of earnings and deductions.

## 7. Integration
Payroll export must support API, CSV/XLSX or other configurable formats. Country-specific compliance/WPS modules remain separate from the generic payroll engine.

## 8. Security
Payroll data is highly restricted and must be controlled by payroll-specific permissions.
