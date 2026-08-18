# Tenant Isolation

## Security Objective
Prevent any customer from accessing another customer's data.

## Required Controls
1. Tenant context is established after authentication.
2. Every repository/service query requires tenant scope where applicable.
3. Background jobs carry tenant context.
4. Queue messages contain tenant identifiers.
5. File/object paths are tenant-scoped.
6. Reports are tenant-scoped.
7. AI retrieval is tenant-scoped.
8. Webhooks are tenant-scoped.
9. Support access is separately authorized and audited.

## Testing
Automated tests must deliberately attempt cross-tenant access and verify denial.

## On-Premise
A customer deployment may contain one tenant, but tenant identifiers remain in the model for consistency.
