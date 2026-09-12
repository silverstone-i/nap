# 0008 — Cell reference data

Design: Accepted. Implementation: Implemented locally; not shipped.

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

Revision 2026-09-12: accepted initial countries/currencies provisioning scope.
