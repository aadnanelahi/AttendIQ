# Employee Management

## Purpose
Employee profile, hierarchy, and lifecycle management per PRODUCT_REQUIREMENTS.md §1 and FUNCTIONAL_REQUIREMENTS.md §Employee Management.

## Domain Model
- **Employee** belongs to exactly one tenant and one legal entity/branch.
  - Employee number (unique per tenant)
  - Personal and contact data
  - Department and designation
  - Manager (employee-to-employee reference)
  - Location/branch
  - Employment status and type
  - Joining/leaving dates
  - Salary information (see docs/payroll/PAYROLL.md)
  - Biometric identifiers/templates where required (see docs/security/BIOMETRIC_DATA_SECURITY.md)
  - Documents
- **Department / Designation / Location** are tenant-level reference data; branch and location also drive access restrictions.

## Lifecycle
- Onboarding: create profile, assign employee number, department, designation, manager, location, salary structure, and device user mapping.
- Transfers: department/designation/branch changes with effective dates.
- Status transitions: active, on-leave, suspended, terminated, rehired.
- Offboarding: leaving date, final settlement inputs, device user deactivation, and access revocation.

## Access and Roles
- Employee data visible only within the employee's branch/location scope unless a broader role grants more (docs/api/RBAC.md).
- HR administrators manage profiles; employees edit only self-service fields.
- Branch/location restrictions enforced server-side, never only by UI (AGENTS.md #4).

## Sensitive Data
- Biometric templates stored separately from the employee record and never returned by default APIs (AGENTS.md #5, docs/security/BIOMETRIC_DATA_SECURITY.md).
- Personal data handling follows docs/compliance/COMPLIANCE.md.

## Audit and History
- Every create/update/delete of employee data and salary data is audited (docs/security/AUDIT_LOGGING.md).
- Change history for salary and employment terms is retained.

## Import/Export
- Bulk import/export of employee master data via docs/integrations/DATA_IMPORT_EXPORT.md.

## Related
- Payroll inputs: docs/payroll/PAYROLL.md
- Mobile self-service: docs/mobile/MOBILE_APP.md
