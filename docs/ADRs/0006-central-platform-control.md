# 0006 — Central platform control

- **Status:** Accepted
- **Date:** 2026-09-08
- **Requirements:** `ARCH-005`, `ARCH-022`, `ARCH-040`, `ARCH-047`, `ARCH-050`

## Context

The owner approved implementing tenant membership with the minimum Core,
platform authorization, and one-cell provisioning work needed for real users.
Cell-local business permissions cannot bootstrap central operator administration.

## Decision

Admin-tenancy owns central platform grants and immutable managed-operation audit.
Core retains tenant business roles and permissions. Factory-generated platform
routes require explicit central permissions without requiring an ordinary tenant
membership or a product entitlement. Authentication selection actions accept a
membership identifier as intent; central operator operations accept separately
validated target identifiers. Neither chooses runtime database credentials.
Restricted sessions can change a required password or choose a membership but
cannot execute tenant data operations. Only separately authorized operator
contracts expose cell registry identifiers; customer contracts never do.

One-cell projections, recoverable activation, and minimal Core identity records
are delivered with this capability. Multi-cell routing, movement, and business
RBAC retain their later roadmap gates. PostgreSQL remains authoritative.

## Consequences

The specification ownership map and factory access contract change first.
Central permissions do not imply arbitrary business access; controlled tenant
access still requires a reason, audit, and the configured cell boundary.

ADR [0007](0007-shared-origin-cell-routing.md) supersedes the one-cell selection limitation; other decisions remain in force.

Naming and platform grant policy are partially superseded by [ADR 0008](0008-scoped-rbac-and-module-entitlements.md); other decisions remain in force.
