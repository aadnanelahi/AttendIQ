# Multi-Tenancy

## Model
A single cloud platform can host multiple customer tenants.

## Tenant Boundary
Tenant is the primary security boundary for business data.

## Requirements
- Every tenant-owned resource has tenant context.
- Authorization must validate tenant membership.
- Background jobs carry tenant context.
- Reports and exports are tenant-scoped.
- AI queries are tenant-scoped.
- Files/object storage are tenant-scoped.
- Audit events identify tenant.
- Administrative support access is explicitly controlled and audited.

## On-Premise
An on-premise deployment may operate as a single-tenant instance while retaining the same domain model.
