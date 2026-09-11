# Payroll Country Modules

## Purpose
Country-specific payroll and WPS rules must be pluggable modules, never baked into the core engine (AGENTS.md #1, PRODUCT_REQUIREMENTS.md §4).

## Module Contract
- A country module implements a fixed interface: tax rules, social-security contributions, statutory allowances/deductions, leave/pay-day statutory rules, statutory holidays, and payout regulations.
- Modules are pure functions of structured inputs (employee, period, attendance-derived values, salary components) and are independently testable (AGENTS.md #10).
- No module may reach into tenant data directly; all inputs passed in, all outputs returned.
- Modules are versioned; a tenant pins a module version per payroll period so results are reproducible.

## What Is Plugged In
- Statutory tax computation and brackets.
- Social security / pension contributions (employer and employee shares).
- Statutory end-of-service/gratuity or severance rules.
- Legal overtime multipliers and night premiums.
- Minimum-wage and max-overtime enforcement.
- Pay slip disclosure requirements.
- Regulatory filing/export formats (see WPS below).

## WPS (UAE Wage Protection System)
- UAE module generates the WPS salary file for the tenant's designated bank.
- Produces employer and employee batch files with exact format, field order, and checksums.
- Generation is deterministic per period; file hash and submission status recorded in the audit log.
- Bank/protocol versions handled inside the UAE module.

## Registry and Distribution
- Registry of installed country modules; a tenant enables the modules matching its legal entities' countries.
- Default: no module (plain configurable payroll). Modules distributed through the integration ecosystem, not shipped as hardcoded engine behavior.

## Testing
- Each module ships golden datasets and edge cases (leap periods, mid-period joins, termination, max caps).
- Core engine runs a reference module set to prove the contract is stable.

## Related
- Core payroll: docs/payroll/PAYROLL.md
- Integrations and webhooks: docs/integrations/INTEGRATION_ARCHITECTURE.md
