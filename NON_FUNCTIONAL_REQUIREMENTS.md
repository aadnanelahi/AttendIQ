# Non-Functional Requirements

## Security
- Strong tenant isolation
- Encryption in transit
- Encryption at rest where appropriate
- Secure secrets storage
- Least privilege
- Immutable/security-conscious audit logging
- Rate limiting
- Secure session management

## Performance
- Near-real-time device transaction ingestion
- Responsive dashboards
- Asynchronous heavy report generation
- Queue-based background processing
- Efficient indexed attendance queries

## Availability
Cloud deployment should support horizontal scaling and resilient services. Device connectivity must tolerate temporary network failures and retry safely.

## Scalability
The architecture must support multiple tenants, branches, devices, employees, and high-volume attendance transactions without redesigning the domain model.

## Localization
English and Arabic from the start. Arabic requires RTL-compatible UI, localized dates/numbers, and translatable labels.

## Maintainability
Modular services, documented APIs, automated tests, observability, migrations, and backward-compatible interfaces.
