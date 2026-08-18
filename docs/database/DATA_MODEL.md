# TechSight Workforce — Data Model

## Core Relationships

Tenant
→ Organization
→ Legal Entity
→ Branch
→ Location
→ Department
→ Employee

Employee
→ Schedule
→ Attendance
→ Leave
→ Overtime
→ Salary
→ Payroll

Tenant
→ Device
→ Device Adapter
→ Device Event
→ Attendance Transaction

Employee
→ Access Assignment
→ Door/Access Group
→ Access Event

Employee/Host
→ Visitor Visit
→ Check-in/Check-out

## Identity
A user account may represent an employee, manager, administrator, auditor or service identity.

Employee identity and authentication identity should remain conceptually separate so an employee can change roles without changing historical workforce records.

## Temporal Data
Employment, salary, schedules, assignments and policies should support effective dates so historical calculations remain reproducible.

## Auditability
Derived attendance and payroll results must be traceable to source events and effective rules.
