# Device Management

## Device Lifecycle
Discovered → Registered → Provisioned → Online → Syncing → Healthy/Degraded → Offline → Retired.

## Device Record
Store:
- Vendor
- Model
- Serial number
- Device identifier
- Tenant
- Location
- Network endpoint
- Protocol
- Capabilities
- Last seen
- Last transaction
- Firmware metadata
- Health status

## Capabilities
Capabilities are discovered/configured rather than assumed:
- Attendance
- Fingerprint
- Face
- Palm
- Card
- User synchronization
- Template synchronization
- Access control
- Push communication
- Pull communication

## Credentials
Device credentials must be stored in secure secret storage and never displayed in ordinary logs.

## Monitoring
Track heartbeat, last communication, transaction lag, errors, synchronization status and connectivity.
