# TechSight Workforce — Database Schema Specification

## 1. Database Strategy
Use a relational database as the authoritative transactional store.

The schema must support SaaS multi-tenancy while remaining deployable as a single-tenant on-premise installation.

## 2. Core Entity Groups

### Tenancy
- tenants
- tenant_settings
- tenant_domains
- tenant_features
- tenant_integrations

### Organization
- organizations
- legal_entities
- branches
- locations
- departments
- positions
- cost_centers

### Identity
- users
- roles
- permissions
- role_permissions
- user_roles
- user_scopes
- sessions
- mfa_methods

### Employees
- employees
- employee_contacts
- employee_documents
- employee_employment
- employee_assignments
- employee_managers

### Devices
- device_vendors
- device_models
- devices
- device_credentials
- device_capabilities
- device_connections
- device_health
- device_sync_jobs

### Raw Events
- device_events
- device_event_errors
- device_event_processing

### Attendance
- attendance_transactions
- attendance_days
- attendance_calculations
- attendance_exceptions
- attendance_adjustments
- attendance_approvals

### Scheduling
- shifts
- shift_rules
- schedules
- employee_schedules
- rosters
- holidays
- holiday_calendars

### Leave
- leave_types
- leave_policies
- leave_balances
- leave_transactions
- leave_requests
- leave_approvals

### Payroll
- salary_structures
- salary_components
- employee_salary
- payroll_periods
- payroll_runs
- payroll_items
- payroll_adjustments
- payslips
- payroll_exports

### Access
- access_devices
- doors
- access_groups
- access_schedules
- access_assignments
- access_events

### Visitors
- visitors
- visits
- visitor_documents
- visitor_checkins

### Notifications
- notification_templates
- notification_preferences
- notification_events
- notification_deliveries

### Audit
- audit_events
- security_events

### AI
- ai_sessions
- ai_messages
- ai_tool_calls
- ai_feedback
- ai_usage

## 3. Tenant Rule
Every tenant-owned table must have a tenant_id or derive tenant ownership through a strictly enforced relationship.

## 4. Event Rule
Raw device events must be retained separately from calculated attendance. This preserves traceability and permits reprocessing after rule changes.

## 5. Payroll Rule
Payroll results must preserve the exact calculation inputs and rule/version used for each payroll run.

## 6. Biometric Rule
Biometric identifiers/templates must be isolated and access-controlled. Do not expose them through general employee APIs.

## 7. Audit Rule
Important administrative and financial mutations must produce audit events containing actor, tenant, timestamp, action, resource, outcome and correlation ID.
