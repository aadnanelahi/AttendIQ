# Device Communication

## Goal
Provide one communication abstraction for biometric and attendance devices from multiple manufacturers.

## Adapter Model
Each vendor implements a connector/adapter exposing normalized operations:
- Register
- Authenticate
- Test connection
- Pull/push transaction
- User synchronization
- Template synchronization where supported
- Device status
- Configuration
- Time synchronization
- Diagnostics

## Initial Vendor
ZKTeco is an initial integration target based on the supplied reference study.

## Important
Vendor protocol implementation must remain isolated from the core domain. The system must not assume every vendor supports the same capabilities.
