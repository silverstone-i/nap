# 0011 — One API with multiple cell databases

- **Status:** Accepted
- **Date:** 2026-09-11
- **Requirements:** `ARCH-005`, `ARCH-007`, `ARCH-009`, `ARCH-010`, `ARCH-022`, `ARCH-028`, `ARCH-050`

## Decision

Supersede ADR 0007: one same-origin API process executes admin and module APIs.
Initialize one pool and fixed module-router set per registered cell UUID. Select
that set from the authenticated tenant assignment; operator cell writes use their
authorized target records. Keep credentials in deployment secrets keyed by UUID.
Central session lookup is admin-only; cell authorization is request-specific.
Admin gates overall readiness; independent cell probes quarantine failures and
recover without restart. Physical schemas are migrated before deployment.

## Consequences

The shared API possesses all configured cell credentials and is a shared failure
domain. Assignment checks, per-cell roles, transaction-local tenant context and
RLS protect data. No inter-API HTTP forwarding, live configuration refresh, tenant
movement, new dependencies or business-controller rewrite is introduced.
