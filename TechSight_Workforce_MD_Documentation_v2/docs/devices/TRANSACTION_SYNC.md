# Transaction Synchronization

## Goal
Reliably move attendance transactions from heterogeneous devices into TechSight.

## Requirements
- Push and pull adapters
- Device-side timestamps
- Server receipt timestamp
- Source identifier
- Unique transaction identity where available
- Idempotency
- Duplicate detection
- Retry
- Offline recovery
- Acknowledgment
- Error quarantine

## Data Preservation
Keep the original vendor payload where legally and operationally appropriate so a normalized transaction can be reprocessed.

## Processing States
RECEIVED → VALIDATED → NORMALIZED → PROCESSED

Failure:
RECEIVED → ERROR/QUARANTINED

A retry must not create duplicate attendance.
