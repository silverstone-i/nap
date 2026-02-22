# ADR-0007: Redis Permission Cache

**Status:** Accepted

**Date:** 2025-02-11

## Context

Permission resolution requires multiple database queries per
request: entity lookup, role resolution, policy aggregation,
state filters, and field groups. This is too expensive to run
on every request.

## Decision

Cache the fully resolved permission canon in Redis at the key
`perm:{userId}:{tenantCode}` with a 15-minute TTL. The JWT
access token carries a permission hash (`ph` claim). On each
request, `authRedis` middleware checks Redis first; on a miss
it loads from the database and populates the cache.

Stale token detection: when the cached permission hash
diverges from the JWT's `ph` claim, the middleware sets an
`X-Token-Stale: 1` response header. The client can then
silently refresh its access token to pick up updated
permissions.

## Consequences

- Reduces per-request DB load from 5-7 queries to 0 (cache hit).
- 15-minute TTL bounds staleness; explicit cache invalidation
  on role/policy changes provides immediate consistency when
  needed.
- Redis dependency is soft: if Redis is unavailable the
  middleware falls back to direct DB loading.
- Permission hash in JWT enables lightweight staleness checks
  without additional network calls.
