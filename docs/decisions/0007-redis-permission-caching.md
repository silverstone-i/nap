# 0007. Redis for Permission Caching over In-Memory Caching

**Date:** 2025-02-17
**Status:** accepted
**Author:** NapSoft

## Context

NAP's RBAC system resolves a user's effective permissions on every request by evaluating their roles and policies against the requested resource. This resolution involves multiple database queries (roles → role_members → policies). Caching the resolved permission set avoids repeated database lookups. The cache must be consistent across multiple server instances (for horizontal scaling) and must survive individual process restarts.

## Decision

Resolved permission sets are cached in Redis at `perm:{userId}:{tenantCode}`. The `authRedis()` middleware reads from this cache on every request:

1. Check Redis for `perm:{userId}:{tenantCode}`
2. If cached, compare the SHA-256 permission hash against the JWT's `ph` claim
3. If the hashes diverge, respond with `X-Token-Stale: 1` to signal the client to refresh its token
4. If not cached, resolve permissions from the database, store in Redis with TTL

Cache invalidation occurs when roles, role_members, or policies are mutated — the affected user's cache key is deleted.

Redis connection is configured via `REDIS_URL` (dev: `redis://localhost:6379`).

## Alternatives Considered

| Alternative | Pros | Cons |
|---|---|---|
| In-memory cache (e.g., `Map` or `lru-cache`) | No external dependency; lowest latency; simplest implementation | Not shared across server instances — each process has its own cache; lost on process restart; inconsistent permissions during rolling deploys |
| Database materialized view | Always consistent; no separate cache layer | Still a database query per request; refresh cost on every policy change; no TTL-based expiration |

## Consequences

**Positive:**
- Shared across all server instances — permission changes are immediately visible regardless of which process handles the next request
- Survives process restarts — cached permissions persist in Redis independently of the Node.js process lifecycle
- TTL-based expiration provides a safety net against stale data even if explicit invalidation is missed
- Permission hash comparison (`ph` claim) enables lightweight staleness detection without re-resolving on every request

**Negative:**
- Redis becomes a required infrastructure dependency — the application cannot start without a Redis connection
- Network round-trip to Redis on every request (sub-millisecond on localhost; low single-digit ms in production)
- Cache invalidation logic must be maintained alongside every role/policy mutation endpoint
