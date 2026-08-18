# Push Protocol

The reference platform uses device push communication/ADMS-style connectivity. TechSight should support push-based device communication through a gateway abstraction.

## Requirements
- Device authentication
- Tenant/device identification
- TLS where supported
- Idempotency
- Replay protection
- Transaction acknowledgment
- Retry handling
- Offline buffering
- Connection monitoring
- Protocol versioning
- Vendor-specific parsing isolated in adapters

Exact protocol behavior must be implemented from the applicable vendor documentation and device testing; this document does not assume undocumented protocol details.
