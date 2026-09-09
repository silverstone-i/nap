# Authorization cache acceleration

## Functionality

- [x] Cache derived session context, platform permissions, memberships, tenant routing, module entitlements, and scoped business grants.
- [x] Reduce repeated PostgreSQL queries while retaining authoritative freshness checks.
- [x] Apply membership revocations, role changes, and tenant suspensions on the next request.
- [x] Preserve session validation, rotation, idle expiry, and absolute expiry.
- [x] Fall back to PostgreSQL when Redis is unavailable, slow, empty, or contains invalid entries.
- [x] Preserve tenant isolation, controlled access, scoped permissions, and sensitive-field enforcement.
- [x] Verify correctness across multiple API processes and two independent cells.
- [x] Provide cache configuration, operational diagnostics, and measured query-reduction evidence.

## Authority and status

**Plan:** Accepted by owner implementation authorization, 2026-09-09.
**Implementation:** Verified upon merge of [PR #20](https://github.com/silverstone-i/nap/pull/20) with required checks passing.

[CI evidence](https://github.com/silverstone-i/nap/actions/runs/34409273920)
confirms the implementation checks; the final documentation head must also pass CI.

ARCH-023 and ARCH-029 govern. ADR 0009 records the approved freshness design.
RBAC and entitlement were implemented in PR #18. This work reduces derived
lookups, retaining live identity/session checks and session expiry writes.

## Delivery

1. Amend ARCH-029, the roadmap and affected PRDs; register ADR 0009.
2. Add module-owned migrations for UUID revision records: central principal,
   tenant, shared support policy and routing; one local revision per tenant.
   Transactional triggers cover security inserts, updates, archive and delete,
   including provisioning, scripts and old application versions. Ignore audit-only
   updates and session activity. Changed ownership invalidates old and new owners.
3. Cache platform grants, selected memberships, assignments, entitlements, scoped
   grants and local projections independently. Memberships depend on both principal
   and selected tenant because existing membership eligibility includes tenant state.
   Keep assignment scopes and field grants intact; compute controlled authority live.
4. Key entries by version, namespace, domain, database/cell, identity and revision
   vector. Use a five-minute cleanup TTL. Validate payloads and key identity. Store
   no credentials, cookies or business rows. Read revisions at every authorization
   transaction boundary; check again on misses; publish only after successful commit.
   Preserve tenant locks, resource policies and live company/project relationships.
5. Inject an official Node Redis client owned by the runtime: 100 ms commands,
   one-second connect timeout, no offline queue, background reconnect. Redis does
   not gate readiness or writes. PostgreSQL failure never authorizes from cache.
   Drain requests before closing. Add URL, namespace and explicit-disable settings,
   safe aggregate diagnostics, and isolated test namespaces. HTTP contracts stay fixed.
6. Verify cold/warm/disabled parity; every revision domain; session expiry, logout,
   rotation and password restrictions; concurrent fills, rollback and delayed fills;
   timeouts, eviction, restart and reconnect with stale data; two cells, independent
   processes, negative RLS and entitlement projection mismatch. Measure query counts
   and latency without an arbitrary speedup target. Exercise login, selection, role
   changes and revocation in a browser with Redis running and stopped.
7. Add Redis to CI/release checks. Run lint, format, typecheck, tests, build, licenses
   and git diff --check. Record evidence here before changing checklist status.

## Rollout

Apply additive migrations before enabling acceleration. Previous application
writes must trigger revision changes too. Disable caching to roll back; retain
migrations. Rotate the namespace after database restoration. A request beginning
after a committed security change must see the new state; already-running requests
retain the existing transaction boundaries.

## Verification

The complete suite passes: **367 tests** (28 toolchain, 286 API, 40 web,
13 shared). Focused cache and isolation checks also pass. Review regression coverage confirms
that cache-enabled cold, warm, malformed-entry, offline, missing-revision, and
unstable-fill paths return the same schema-normalized shape; unstable fills are
not published.

- Authentication and RBAC suites run with acceleration disabled and enabled,
  including three API processes and two independent cells. Coverage includes live
  sessions, revocation, support policy, routing, scoped permissions, sensitive fields,
  and stale entitlement projections.
- Cache integration checks cover revision mutations, moved principals, audit-only
  writes, rollback, concurrent and delayed fills, malformed entries, eviction,
  disconnected and stalled Redis, reconnection with obsolete entries, and failure
  of PostgreSQL freshness reads. The shared isolation harness covers revision RLS.
- Browser checks used disposable fixtures: login, tenant selection, company access,
  and role edits succeeded with Redis offline. Tenant suspension and role revocation
  denied the next access and remained denied after Redis reconnected. No browser
  console errors were reported.
- Lint, formatting, typecheck, build, production licenses (227 records), and
  `git diff --check` pass. CI and release verification now supply Redis.

### Query and timing evidence

The focused local fixture run on 2026-09-09 measured these service transactions:

| Lookup            | Acceleration disabled         | Warm cache           | Retained database work                         |
| ----------------- | ----------------------------- | -------------------- | ---------------------------------------------- |
| Tenant assignment | One derived query per request | Zero derived queries | One revision read                              |
| Scoped grants     | Five derived reads            | Zero derived reads   | One revision read and the existing tenant lock |

Five disabled assignment requests issued five derived queries. A cold request plus
five warm requests issued one derived query and seven revision reads (two for the
miss, one per hit). The cleanup TTL was verified at five minutes.

The focused fixture recorded assignment times of 0.59–1.45 ms disabled, 2.59 ms
cold, and 1.05–1.33 ms warm. Scoped authorization recorded 2.36 ms disabled and
1.88 ms warm. These small loopback samples prove query reduction, not a production
latency guarantee; assignment overhead can exceed the cost of its original query.
Under full-suite contention, scoped authorization measured 2.69 ms disabled and
5.32 ms warm, reinforcing that no universal latency improvement is claimed.

### Operations

Configure `REDIS_URL` (or `REDIS_URL_TEST` in tests) and a deployment-specific
`REDIS_CACHE_NAMESPACE`. `REDIS_CACHE_ENABLED=false` bypasses acceleration without
removing migrations. Production requires a URL unless explicitly disabled;
development without a URL uses PostgreSQL. Test fixtures isolate their namespaces.

Apply the admin-tenancy, cell-tenancy, core, and projects additive migrations to
the admin database and every cell before enabling caching. Existing application
versions also invalidate revisions through database triggers. No real development
or production databases were migrated during verification.

Monitor `cache.ready` and `cache.unavailable` transition logs. Shutdown emits
`cache.summary` totals for reads, raw hits/misses, writes, failures, and elapsed
command time. Debug `cache.lookup` events distinguish validated hits, misses,
invalid payloads, and fallback by domain. Logs omit cache keys, payloads and
credentials. Redis is excluded from readiness and closes after requests drain.

A rollback sets `REDIS_CACHE_ENABLED=false` and retains the compatible migrations.
After database restoration, rotate `REDIS_CACHE_NAMESPACE` before enabling cache
use so restored revision values cannot address pre-restoration entries.
