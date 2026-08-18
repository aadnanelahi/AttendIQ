# Database Architecture

## Requirements
The database must support:
- Multi-tenancy
- Organizations
- Branches
- Locations
- Employees
- Users
- Roles
- Devices
- Raw device events
- Attendance transactions
- Calculated attendance
- Shifts
- Rosters
- Leave
- Payroll
- Access events
- Visitors
- Notifications
- Audit logs
- AI activity metadata

## Principles
- Tenant identifiers on tenant-owned records
- Strong foreign-key relationships
- Appropriate indexes
- Immutable event history where required
- Migration-based schema management
- No cross-tenant queries without explicit authorization context
