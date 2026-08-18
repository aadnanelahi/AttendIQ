# System Design

## Main Flow
Device/mobile -> Gateway/API -> Validation -> Event/Queue -> Attendance Engine -> Database -> Reporting/Payroll/Notifications.

## Transaction Processing
1. Receive transaction.
2. Authenticate source.
3. Identify tenant/device.
4. Validate payload.
5. Normalize vendor-specific fields.
6. Deduplicate using idempotency keys.
7. Persist raw event where required.
8. Publish normalized attendance event.
9. Calculate attendance asynchronously.
10. Update real-time views.
11. Trigger downstream workflows.

## Reliability
Transactions must be safely retryable. Processing must be idempotent. Temporary device/network failures must not cause permanent data loss.

## Separation
Raw device events, normalized attendance transactions, calculated attendance, payroll inputs, and reports are separate concepts.
