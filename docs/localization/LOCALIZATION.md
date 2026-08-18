# Localization

## Purpose
English and Arabic must be supported from the start. The UI must be localization-ready and RTL-capable (AGENTS.md #11, NON_FUNCTIONAL_REQUIREMENTS.md §Localization).

## Strategy
- Key-based translation catalogs; display strings never hardcoded in components.
- One locale set per tenant; default fallback to English.
- Pluggable localization service so additional languages can be added without domain model changes.

## RTL
- Rendered layout driven by document direction attribute (`dir="rtl"`), not duplicated layouts.
- All layout primitives (grid, flex, icons, spacing, drawers) must be direction-agnostic and validated under RTL.
- Mixing of LTR/RTL content (employee names, numeric identifiers) handled with unicode bidi controls.
- Icons that imply direction (arrows, chevrons, progress) flip or remain neutral as appropriate.

## Dates, Numbers, and Currency
- Dates: locale-aware formats; Gregorian default, Hijri calendar as an optional tenant display preference. All dates stored in a timezone-safe canonical form; formatting happens at display.
- Numbers: Arabic-Indic vs Western digits per locale; grouped separators localized.
- Currency: ISO 4217 codes stored; symbol and decimal placement localized (e.g. Arabic locale places the symbol left of amounts).
- Time: 12/24-hour per tenant preference; timezone always explicit per branch/location.

## Translation Workflow
- Translation keys versioned; missing-key fallback to English with a detectable sentinel for QA.
- Pluralization and gender handled through ICU-style message syntax.
- Bulk import/export of translation catalogs for translators.
- Arabic copy reviewed by native speakers; term glossary maintained in docs/glossary/GLOSSARY.md.

## Testing
- Automated checks: no hardcoded user-facing strings, all keys resolve, no missing-key sentinels.
- RTL visual regression coverage for core flows (dashboard, forms, approvals, reports, mobile).
- Test data includes Arabic employee names and right-to-left content in attendance/payroll/reporting paths.

## AI Assistant
- AI assistant replies respect the tenant's active locale; prompts and labels localized (docs/ai/AI_WORKFORCE_PLATFORM.md).
