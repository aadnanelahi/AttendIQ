# Notification Engine

## Channels
- Email
- WhatsApp

## Events
- Attendance exceptions
- Leave submitted/approved/rejected
- Overtime submitted/approved/rejected
- Payroll events
- Device offline/online
- Announcements
- Security events where configured

## Architecture
Common notification event -> template -> channel adapter -> provider -> delivery tracking.

Provider failures must support retry and dead-letter handling.
