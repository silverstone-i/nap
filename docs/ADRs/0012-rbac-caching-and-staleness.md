# 0012 — RBAC caching and staleness

- **Status:** Accepted
- **Date:** 2026-08-07

## Context

Resolution (ADR-0008) runs over the user's cell list on every request,
and PRD 0003 bounds propagation: a grant change takes effect
immediately on explicit invalidation, within 15 minutes worst case
without it. This ADR records where the cells live and how stale they
may get. It builds on ADR-0004, which established the per-user
permission canon in Redis and the token's `ph` claim.

## Decision

1. **Truth is Postgres; the per-user cell list caches in Redis.** The
   canon key is `perm:<userId>:<tenantCode>` (ADR-0004), TTL 900
   seconds, built lazily at login and on cache miss.
2. **Explicit invalidation is the mechanism; TTL is the backstop.**
   Every grant-mutation endpoint deletes the affected users' canon
   keys. The TTL exists only to cap the damage of a missed delete.
3. **The JWT carries identity plus `ph` — a hash of the cell list —
   never the grants themselves.**
4. **On rebuild, a hash mismatch sets `X-Token-Stale: 1`.** The canon,
   not the token, is authoritative on every request; the header only
   tells the client to refresh, the flow ADR-0004 already uses for
   tenant switches.

## Consequences

- PRD 0003's bound is met by construction: a deleted key rebuilds from
  Postgres on the next request (immediate), and a missed invalidation
  expires with the TTL (900 seconds).
- Losing Redis is safe — the canon rebuilds lazily, the same fail-open
  pattern as ADR-0004's active-tenant key.
- Every new grant-mutation endpoint owes a cache delete. Forgetting
  one degrades to the 15-minute bound, never to permanent staleness.

## Alternatives considered

**Grants embedded in the JWT.** Rejected. The cookie grows with every
role, and the grants freeze until token expiry — a revocation would
wait on the token instead of the canon, breaking the 15-minute bound
the moment the lifetime changes.

**No cache — query Postgres per request.** Rejected. Every request
pays the cell query for freshness the 900-second TTL plus explicit
deletes already provides.

**TTL-only staleness.** Rejected. Every grant edit would wait up to
15 minutes. Deleting the key at the mutation endpoint makes the common
case immediate at the cost of one Redis call.
