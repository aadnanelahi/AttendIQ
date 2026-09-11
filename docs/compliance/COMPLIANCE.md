# Compliance

## Purpose
Privacy, data protection, and regulatory compliance posture for cloud and on-premise deployments, complementing docs/security/SECURITY_ARCHITECTURE.md and docs/compliance/PRIVACY.md.

## Data Protection
- Data processed under documented legal bases per purpose (employment administration, payroll, security, statutory obligations).
- Employees retain the right to access, rectify, and request deletion where permitted; deletion requests coordinated with audit and legal-hold obligations.
- Biometric data is treated as highly sensitive (AGENTS.md #5): explicit consent, limited purpose, and technical safeguards per docs/security/BIOMETRIC_DATA_SECURITY.md.
- Retention schedules defined per data category (attendance, payroll, biometric, visitor, audit) with enforcement and legal hold.

## Regional Considerations
- UAE (primary market): data residency, WPS filings, and labor-law record retention.
- GDPR-style obligations where the tenant's workforce is covered; DPAs available for tenants processing EU personal data.
- On-premise deployments are customer-managed; compliance responsibilities documented in the deployment agreement.

## Operational Security
- Background checks and access controls for operators with tenant access; least privilege (NON_FUNCTIONAL_REQUIREMENTS.md §Security).
- Security incident response and breach-notification process with tenant communication points.
- Penetration testing and security review cadence per docs/devops/MONITORING.md.

## Audits and Certifications
- Audit logging supports independent audit (docs/security/AUDIT_LOGGING.md).
- Certification/attestation roadmap is tracked as part of Phase 7 (ROADMAP.md).

## Related
- Privacy: docs/compliance/PRIVACY.md
- Security architecture: docs/security/SECURITY_ARCHITECTURE.md
- Backup and recovery: docs/operations/BACKUP_AND_RECOVERY.md
