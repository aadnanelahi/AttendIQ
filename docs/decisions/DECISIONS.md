# Decision Log

Record of significant architectural and product decisions. Each entry is immutable once accepted; new entries are appended, never edited.

Format: ADR-#### | Date | Status (Proposed / Accepted / Superseded)

## ADR-0001 — Vendor-Neutral Device Architecture
- **Status:** Accepted
- **Decision:** All hardware integrations go through a vendor adapter/gateway pattern (AGENTS.md #2); no vendor-specific assumptions in the core domain model (AGENTS.md #1).
- **Rationale:** Supports ZKTeco initially and additional vendors without redesign; keeps device behavior behind a stable internal contract.

## ADR-0002 — Multi-Tenant Isolation
- **Status:** Accepted
- **Decision:** Mandatory tenant isolation at every layer; tenant ID on all data, enforcement server-side (AGENTS.md #3, #4).
- **Rationale:** SaaS security baseline; prevents cross-tenant leakage including in AI features (AGENTS.md #12).

## ADR-0003 — Deterministic Attendance and Payroll Engines
- **Status:** Accepted
- **Decision:** Attendance and payroll calculations are pure, deterministic functions over approved inputs (AGENTS.md #9, #10); country rules plug in as modules.
- **Rationale:** Testability, auditability, and reproducible results across runs and re-runs.

## ADR-0004 — Biometric Data Handling
- **Status:** Accepted
- **Decision:** Biometric templates are highly sensitive: stored separately, never logged, never returned by default (AGENTS.md #5, #6).
- **Rationale:** Reduces breach impact and supports consent-based compliance (docs/compliance/COMPLIANCE.md).

## ADR-0005 — Audit Logging for All Important Mutations
- **Status:** Accepted
- **Decision:** Every important mutation writes to an append-only, tenant-scoped audit log (AGENTS.md #7, docs/security/AUDIT_LOGGING.md).
- **Rationale:** Regulatory and customer trust; immutability protects log integrity.

## ADR-0006 — English and Arabic From Day One
- **Status:** Accepted
- **Decision:** Localization-ready, RTL-capable UI for English and Arabic from V1 (AGENTS.md #11, docs/localization/LOCALIZATION.md).
- **Rationale:** Primary market requires Arabic; retrofitting RTL later is disproportionately costly.

## ADR-0007 — Country Payroll Rules as Pluggable Modules
- **Status:** Accepted
- **Decision:** Country-specific tax, social security, and WPS rules are versioned modules behind a fixed interface (docs/payroll/PAYROLL_COUNTRY_MODULES.md).
- **Rationale:** Keeps core payroll generic, independently testable, and extensible per market.
