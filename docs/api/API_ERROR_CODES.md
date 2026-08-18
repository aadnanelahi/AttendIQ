# API Error Codes

## Standard Envelope
Errors should contain:
- machine-readable code
- human-readable message
- request/correlation ID
- optional field errors

## Categories
AUTHENTICATION_ERROR
AUTHORIZATION_ERROR
TENANT_ACCESS_DENIED
VALIDATION_ERROR
NOT_FOUND
CONFLICT
IDEMPOTENCY_CONFLICT
RATE_LIMITED
DEVICE_ERROR
INTEGRATION_ERROR
PROCESSING_ERROR
INTERNAL_ERROR

Do not expose stack traces or secrets to clients.
