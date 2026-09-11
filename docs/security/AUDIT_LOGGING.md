# Audit Logging

## Purpose
All important mutations must be audited (AGENTS.md #7). Audit logging must be immutable/security-conscious (NON_FUNCTIONAL_REQUIREMENTS.md §Security).

## Scope
- Every mutation that changes business state: employee records, attendance corrections, approvals, leave, payroll runs and locks, device registration/config, access control, visitor events, permission changes, tenant configuration.
- Authentication events: successful and failed logins, MFA events, session revocations.
- Authorized data exports and API admin operations.

## Record Contents
- Tenant ID (audit records are always tenant-scoped and never cross tenant boundaries).
- Actor: user ID, role at time of action, and origin (web, mobile, device, API, system).
- Action, resource type, and resource ID.
- Before/after state for changed fields (structured diff where practical).
- Timestamp (UTC, immutable), request/trace ID, IP, and user-agent.
- Result (success/failure) and reason code.

## Immutability
- Append-only log; no update or delete of records, including by administrators.
- Records written through a dedicated service; storage layered for WORM characteristics.
- Optional hash chaining to detect tampering.
- Retention policy per tenant/compliance requirements, with legal-hold support.

## Never Logged
- Credentials, password hashes, biometric templates, tokens, secrets, or full card/PIN data (AGENTS.md #6).
- Field-level logging config must redact sensitive categories by default.

## Delivery and Reliability
- Written asynchronously behind a queue so audit failures never block the primary mutation.
- Buffered with ordering guarantees per resource; durable before ack for critical events.
- Fail-closed only where required (e.g. payroll lock); otherwise degrade to error visibility via monitoring.

## Access and Review
- Read access restricted to tenant auditors/administrators; no tenant can read another tenant's log.
- Queryable by actor, resource, action, date range, and tenant.
- Surfaces to audit and compliance reports (docs/reports/REPORTING_ENGINE.md, docs/compliance/COMPLIANCE.md).

## Related
- API and RBAC: docs/api/RBAC.md, docs/api/AUTHENTICATION.md
- Monitoring of audit pipeline health: docs/devops/MONITORING.md
