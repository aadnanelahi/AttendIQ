# Real-Time Architecture

## Real-Time Events
- Device online/offline
- New attendance punch
- Attendance calculation update
- Approval status
- Notification status
- Access event
- Visitor check-in/out

## Transport
Use a scalable event/notification mechanism appropriate to the deployment.

## Rule
The UI's real-time state is derived from authoritative backend events. Clients must not be trusted to create authoritative attendance/payroll state.
