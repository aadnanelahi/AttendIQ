# Attendance Calculation Specification

## 1. Inputs
- Raw device transactions
- Mobile punches
- Manual corrections
- Employee schedule
- Shift
- Break rules
- Grace periods
- Holidays
- Leave
- Overtime policy
- Attendance policy

## 2. Processing Pipeline
1. Normalize source transaction.
2. Resolve employee.
3. Resolve effective schedule.
4. Resolve applicable rules.
5. Group transactions into attendance windows.
6. Identify check-in/out pairs.
7. Calculate work duration.
8. Apply breaks.
9. Calculate late/early.
10. Determine absence/rest-day/holiday status.
11. Calculate overtime.
12. Generate exceptions.
13. Persist calculation result and rule version.

## 3. Rule Precedence
The final implementation must define precedence explicitly for:
- Global policy
- Tenant policy
- Department policy
- Employee policy
- Schedule
- Temporary schedule
- Leave
- Holiday

## 4. Overnight Shifts
Cross-midnight shifts must be treated as one logical attendance period where configured.

## 5. Missing Punch
Missing check-in/out must generate an exception rather than silently inventing a timestamp.

## 6. Recalculation
Authorized administrators may trigger recalculation after policy changes or corrected source data. Recalculation must preserve audit history.

## 7. Explainability
The system should be able to explain why a day was classified as present, late, absent, overtime, leave, etc.
