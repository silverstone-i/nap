# 0010 — Cell reference data

Design: Accepted. Implementation: Implemented and shipped in
[PR #24](https://github.com/silverstone-i/nap/pull/24), included in
[release v0.17.0](https://github.com/silverstone-i/nap/releases/tag/v0.17.0).
This status covers the seed subset, not broader reference-data workflows.
The [production verification record](../guides/production-setup.md#verification-record)
owns the recorded live seeding evidence.

## Requirements

Implements ARCH-044 and ARCH-047. The reference-data module owns cell-wide countries
and currencies. No tenant identity, mutable user-facing workflow, or country/currency
one-to-one relationship is introduced.

Countries: alpha-2 primary key, unique alpha-3 and numeric codes, name.
Currencies: three-letter primary key, numeric code and name, nullable minor units.
Use versioned ISO-derived data with source and redistribution evidence. Maintenance
seeding inserts missing codes without modifying existing records and records its
snapshot version transactionally. Runtime receives read-only access.

## Acceptance

Fresh seed matches the committed snapshot's code sets; replay preserves existing
values and inserts missing codes; activation requires the current seed version and
all required codes. Tests own synthetic data and do not download seed inputs.

## Revisions

Historical entries below record the state at each delivery date. Current
requirements are in the subject sections above.

Revision 2026-09-12: accepted initial countries/currencies provisioning scope.

Revision 2026-09-15: renamed the reference-data PRD to 0010 to remove the duplicate number; reconciled shipped seed status with PR #24 and v0.17.0.

Revision 2026-09-15: consolidated current requirements and references; repaired revision tables without changing historical evidence or runtime behavior.
