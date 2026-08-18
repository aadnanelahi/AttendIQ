# AI Development Rules

## Product
TechSight Workforce Management is a modern SaaS workforce platform owned by TechSight Innovations FZE LLC.

## Rules
1. Never introduce vendor-specific assumptions into the core domain model.
2. Hardware integrations must use a vendor adapter/gateway pattern.
3. Tenant isolation is mandatory.
4. Authorization must be enforced server-side.
5. Biometric data must be treated as highly sensitive.
6. Never log credentials, biometric templates, tokens, or secrets.
7. All important mutations require audit logging.
8. APIs must be versioned and documented.
9. Attendance calculations must be deterministic and testable.
10. Payroll calculations must be configurable and independently testable.
11. English and Arabic must be supported; UI must be localization-ready and RTL-capable.
12. AI features must respect tenant authorization and must not expose data across tenants.
13. Prefer backward-compatible migrations.
14. Every feature requires automated tests appropriate to its risk.
15. Do not implement functionality contrary to PRODUCT_REQUIREMENTS.md or ARCHITECTURE.md without updating the documentation first.
