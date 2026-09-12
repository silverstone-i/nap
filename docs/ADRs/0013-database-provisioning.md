# 0013 — Database provisioning

- **Status:** Accepted
- **Date:** 2026-09-12
- **Requirements:** ARCH-005, ARCH-008, ARCH-009, ARCH-019, ARCH-022, ARCH-044, ARCH-047

## Decision

Adopt the specification's Database provisioning contract. Separate setup, migration,
admin bootstrap, cell seeding, and activation. Explicit cell suffixes determine
physical names; UUIDs bind registry and physical identities. Persist disabled intent
before resource creation and resume failures without automatic deletion or adoption.
Render infrastructure creation uses separate credentials and activation is explicit.

Replace the initial eight admin migrations with five frozen migrations for the
approved empty-database baseline. This does not permit rewriting future migrations.
Countries and currencies belong to reference-data, independently of tenant RBAC.

## Consequences

This supersedes ADR 0012's deferral of complete setup and physical identity checks,
and ADR 0011's deferral of that maintenance workflow. Runtime topology is unchanged.
Historical ledgers require an explicitly separate transition; this delivery refuses
them. Production execution is separate from implementing and testing the scripts.
