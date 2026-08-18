# Authentication

## Requirements
- Secure login
- Access/refresh session model as appropriate
- Password hashing
- Password reset
- Session revocation
- Device/session visibility
- MFA-ready design
- Brute-force protection
- Rate limiting

## Service Accounts
Integrations should use dedicated service identities rather than human credentials.

## Authorization
Authentication proves identity. Authorization independently verifies tenant, role and resource permission.
