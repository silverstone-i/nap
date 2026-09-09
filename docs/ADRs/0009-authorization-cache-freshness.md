# 0009 — Authorization cache freshness

- **Status:** Accepted
- **Date:** 2026-09-09
- **Requirements:** ARCH-023, ARCH-029

## Context

Immediate revocation must survive failed Redis invalidation. Session activity
also requires PostgreSQL writes. The owner approved database freshness checks
before cache use in the authorization cache implementation plan.

## Decision

Use database-owned UUID revisions changed by transactional triggers. Cache keys
include revision vectors read afresh inside authorization transactions. A missing
revision bypasses caching; a failed database read fails the request. Invalidation
is logical, independent of Redis availability; TTL is cleanup only.

Admin revisions cover principals, tenants, shared support policy and routing.
Local revisions cover a tenant's bindings, assignments, roles, targets and
entitlement projections. Each owning module installs its own triggers. Revision
records are internal metadata without audit/soft deletion; local records use RLS.

Cache selected memberships with principal and tenant revisions. Keep session and
identity checks live. Keep scoped grants intact and compute controlled authority
from the current session. Stable fills publish only after transaction commit.

Use an injected Node Redis client with bounded commands, offline queuing disabled,
background reconnect and PostgreSQL fallback. Redis does not gate readiness.
Managed deployments configure Redis; an explicit disable setting supports rollback.
Deploy migrations first and rotate namespaces after database restoration.

## Alternatives

TTL-only invalidation admits revoked access. Coordinating database-free cache hits
with all writers adds unnecessary distributed consistency machinery for this scope.

## Consequences

Warm requests retain small PostgreSQL checks and session writes. Security writes
invalidate entries even from old application versions or scripts. Five-minute TTLs
remove unreachable entries. Public APIs and authorization outcomes stay unchanged.
