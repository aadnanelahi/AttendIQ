# Attendance Engine

The attendance engine is a core domain service.

## Inputs
- Device transactions
- Mobile punches
- Manual corrections
- Employee schedules
- Shifts
- Holidays
- Leave
- Attendance policies

## Outputs
- Present
- Absent
- Late
- Early departure
- Missing punch
- Overtime
- Leave
- Holiday/rest day
- Attendance exceptions

## Rules
Calculations must be deterministic, versioned, explainable, and independently testable.

Every calculated result should be traceable to source transactions and applied rules.
