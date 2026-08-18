# TechSight Workforce — Architecture Specification

## 1. Purpose
Define the production architecture for TechSight Workforce Management, a modern SaaS workforce platform owned by TechSight Innovations FZE LLC.

## 2. Architecture Goals
- Cloud SaaS and on-premise deployment
- Multi-tenant isolation
- Vendor-neutral biometric/device integration
- Real-time attendance processing
- Integrated payroll
- Access control and visitor management
- Mobile workforce
- English/Arabic
- Email and WhatsApp notifications
- AI-ready analytics
- Strong security and auditability

## 3. Logical Layers

### Experience Layer
- Web administration portal
- Employee self-service portal
- Android application
- iOS application

### API / Identity Layer
- API gateway
- Authentication
- Authorization
- Tenant context
- Rate limiting
- API versioning

### Domain Layer
- Organization
- Employee
- Attendance
- Scheduling
- Leave
- Overtime
- Payroll
- Access
- Visitor
- Notification
- Reporting

### Integration Layer
- Device gateway
- Vendor adapters
- HR/ERP/payroll connectors
- Email provider
- WhatsApp provider
- Webhooks

### Platform Layer
- Relational database
- Cache
- Message broker
- Object storage
- Search/analytics storage where required
- Observability
- Secrets management

## 4. Architectural Rule
Vendor protocols, notification providers and external systems must never become dependencies of the core workforce domain model.

## 5. Deployment Modes

### SaaS
Shared application platform with tenant isolation.

### On-Premise
Customer-controlled installation containing application, database, workers and device gateway.

### Hybrid
Cloud application plus customer-side gateway for devices located on private networks.

## 6. Real-Time Principle
Device transactions enter through the gateway and are converted into normalized domain events. Attendance calculations and downstream processing are asynchronous where possible.

## 7. Security Boundary
Tenant context is mandatory for all tenant-owned requests, jobs, events, reports and AI operations.
