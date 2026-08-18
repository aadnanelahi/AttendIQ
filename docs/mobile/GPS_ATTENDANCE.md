# GPS Attendance

## Punch Process
1. Employee authenticates.
2. App requests location.
3. App captures location and accuracy metadata.
4. Server validates employee, tenant and attendance policy.
5. Server evaluates allowed location/geofence.
6. Punch is accepted/rejected with an auditable reason.
7. Attendance event is created.

## Privacy
TechSight should capture location for the attendance event rather than continuously track employees unless a separately authorized product feature requires it.

## Anti-Abuse
Consider mock-location detection, device integrity signals and impossible-travel patterns. These are detection signals, not automatic proof of fraud.
