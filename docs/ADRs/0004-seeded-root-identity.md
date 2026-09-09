# 0004 — Seeded root identity

- **Status:** Accepted
- **Date:** 2026-09-07
- **Requirements:** `ARCH-022`, `ARCH-028`, `ARCH-040`

## Context

Every login resolves to a tenant, and portal identities are meant to arrive
through tenant provisioning: an operator registers the tenant, records its
first administrator as an employee marked as an application user, and the
membership workflow creates the portal identity from that record. The
`admin-tenancy` and `core` tables that workflow needs are not built, and the
roadmap places Authentication and sessions before both. Its gate requires a
real login whose actor and tenant are read from the database, and the operator
must be able to log in before any tenant can be provisioned. The owner chose
this resolution on 2026-09-07.

## Decision

Amend `ARCH-040` to name one exception to provisioned identities. A seed
script, run by the operator after the admin migrations and reading the `ROOT_*`
configuration values, inserts the platform operator's own tenant, a root portal
identity, and the membership between them. The root identity is the first
`package_admin`. It has no employee record, its login identifier cannot change,
and no ordinary user route can lock, deactivate, or demote it. The seed is
idempotent and writes the password only when it creates the identity, so the
database owns the password from then on and the configured value is inert once
used; a separate reset flag is the operator's recovery path. Rows the seed
creates carry a null actor, as the database record conventions allow for
bootstrap. Every other identity is created by the membership workflow that
Tenant membership and control plane designs.

## Alternatives and consequences

Self-registration appears nowhere in the specification or roadmap and would add
abuse controls with no tenant to register into. Checking credentials from
configuration at login leaves no database-backed session, which `ARCH-022` and
`ARCH-023` forbid. Waiting for Tenant membership and Core before login delays
every authenticated route behind two unbuilt capabilities. Seeding from a
migration fixes the password at release time and places it in migration
history. The consequence accepted here is one identity that provisioning did
not create and one guard in the identity code protecting it. The exception is
not a template: the Tenant membership PRD owns the ordinary identity workflow
and must not widen it.

Naming and platform grant policy are partially superseded by [ADR 0008](0008-scoped-rbac-and-module-entitlements.md); other decisions remain in force.
