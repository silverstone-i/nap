# M0001-11: Cache Consistency

## 1. Document Control

| Field                | Value                                               |
| -------------------- | --------------------------------------------------- |
| Status               | Implemented                                         |
| Type                 | Module Work Unit                                    |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)   |
| Related architecture | [BFF](../../../architecture/bff.md)                 |
| Related PRDs         | M0001-01 through M0001-10                           |
| Related decisions    | PostgreSQL remains authoritative; Redis is optional |
| Last reviewed        | 2026-09-19                                          |

## 2. Purpose

Prevent cached admin decisions from outliving the data that authorized them.

## 3. Scope

### Included

- Persistent revision counters for cache dependencies.
- Atomic revision advancement with source changes.
- Cache validation and PostgreSQL fallback.

### Excluded

- Table definitions and migrations.
- Cache payload persistence in PostgreSQL.
- Mutation-specific calls from later source Work Units.
- Cell-local cache invalidation.

## 4. Actors And Permissions

| Caller                     | Condition                         | Result                                             |
| -------------------------- | --------------------------------- | -------------------------------------------------- |
| Authorized source mutation | Source row changes                | Advance affected revisions in the same transaction |
| Cache consumer             | Complete matching revision vector | Reuse cached value                                 |
| Cache consumer             | Missing or mismatched vector      | Read PostgreSQL and refill cache                   |
| Any caller                 | Revision cannot be verified       | Do not use cached authority                        |

## 5. Concepts And Terminology

| Term               | Meaning                                                       |
| ------------------ | ------------------------------------------------------------- |
| Revision key       | `(domain, entity)` pair identifying a cache dependency        |
| Revision vector    | Ordered set of dependency revisions stored with a cache value |
| Authoritative read | Read from PostgreSQL after cache absence or invalidation      |

## 6. Functional Requirements

- M0001-11-R001: The module must read and atomically advance persistent revision counters.
- M0001-11-R002: The service must let each authorization-relevant admin mutation advance all affected revision keys in the source transaction. The source Work Unit owns and verifies its calls.
- M0001-11-R003: Consumers must reuse a cached value only when every stored revision matches PostgreSQL.
- M0001-11-R004: Correct behavior must continue when Redis is absent or unavailable.

| Domain        | Entity                                            | Advanced by                                                                                                                                              |
| ------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user`        | Portal-user UUID                                  | Account, password, or eligibility change                                                                                                                 |
| `session`     | Session UUID                                      | Create, rotate, context change, expiry, or revocation                                                                                                    |
| `roles`       | Portal-user UUID                                  | Any portal-user role grant or removal                                                                                                                    |
| `membership`  | Portal-user UUID and tenant UUID as separate keys | Membership change                                                                                                                                        |
| `tenant`      | Tenant UUID, or the literal `list`                | Tenant state, assignment, or readiness change; `list` on tenant creation, since a new tenant's own key cannot invalidate a list cached before it existed |
| `cell`        | Cell UUID                                         | Registry, enabled, or provisioning change                                                                                                                |
| `entitlement` | Tenant UUID                                       | Entitlement change                                                                                                                                       |

## 7. Business Rules And Invariants

- M0001-11-R005: A successful source mutation and its revision advances must commit or roll back together.
- M0001-11-R006: Cache keys must include every user, tenant, role, session, and entitlement dimension that affects the result.

An unstored key reads as revision `0` without creating a row. The first advance
inserts revision `1`; later advances use `revision + 1` under row locking.
Vectors expose revisions as decimal strings so JavaScript does not lose 64-bit
integer precision. Cache fill reads source data and its revision vector in one
read-only, repeatable-read transaction, then writes Redis after commit.

Redis failures are ignored after safe logging. PostgreSQL source or revision
failure returns `503` for authorization-dependent operations; stale authority is
never used. Revision rows are current state and are not deleted automatically.

## 8. Lifecycle And State Transitions

| Situation                 | Result                                       |
| ------------------------- | -------------------------------------------- |
| No cached value           | Read PostgreSQL and fill cache               |
| Matching revision vector  | Return cached value                          |
| Missing or stale revision | Discard value, read PostgreSQL, refill       |
| Source mutation           | Commit source and revision advances together |
| Redis unavailable         | Read PostgreSQL; continue without cache      |
| PostgreSQL unavailable    | Fail closed with `503`                       |

## 9. Data Requirements

This Work Unit uses `admin.cache_revisions`. M0001-00 defines its composite key,
64-bit counter, timestamp, and atomic model method.

## 10. API Requirements

No public route is introduced.

| Internal operation                  | Result                                               |
| ----------------------------------- | ---------------------------------------------------- |
| `current(keys, { tx? })`            | Complete ordered decimal-string revision vector      |
| `advance(keys, { tx })`             | New revisions inside the required source transaction |
| `getOrLoad(cacheKey, keys, loader)` | Valid cached value or authoritative result           |

`loader(tx)` receives the repeatable-read transaction and returns a
JSON-serializable value. Duplicate or malformed revision keys return
`INVALID_INPUT`. PostgreSQL failures return `SERVICE_UNAVAILABLE`. The
operations do not retry failed source transactions; the originating command may
retry its entire idempotent operation.

## 11. Cross-Module Interactions

Each later source Work Unit calls `advance` for its listed keys and verifies that
integration. Role definitions live in cells, so the receiving access-control
integration must also supply the owning cell's role revision before resolved
capabilities may be cached. An Admin assignment revision alone is insufficient.

## 12. Security And Audit

Cache payload access follows the source record's authorization scope. Redis keys
hash the caller's opaque cache identity and canonical revision keys; they do not
contain emails, names, passwords, tokens, reasons, or UUIDs. Redis failures log
only stable codes. Ordinary cache hits and fills do not create managed events.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                         | Requirements                 |
| --------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| AC01      | Every domain can initialize, read, and advance a monotonic revision.                                                    | M0001-11-R001                |
| AC02      | Callers can advance multiple affected keys in the source transaction; source failure rolls back every revision advance. | M0001-11-R002, M0001-11-R005 |
| AC03      | Missing or mismatched vectors prevent cache reuse.                                                                      | M0001-11-R003                |
| AC04      | Redis failure falls back to PostgreSQL; PostgreSQL failure does not use stale authority.                                | M0001-11-R004                |
| AC05      | Cross-user, cross-tenant, and cross-session cache reuse is impossible.                                                  | M0001-11-R006                |

### Verification Evidence

Local validation on 2026-09-19: `npm run lint`, `npm run format:check`,
`npm test` (147 tests across the workspace), `npm run build`,
`npm run licenses`, and `git diff --check` passed.

`npm run test:db` passed 30 tests against a disposable PostgreSQL 18 server.
[Cache consistency tests](../../../../apps/api/tests/integration/cache-consistency.test.js)
cover missing revision keys, atomic multi-key advance, transaction rollback, and
concurrent monotonic advance. Unit tests cover validation, opaque Redis keys,
matching and stale vectors, Redis fallback, PostgreSQL fail-closed behavior,
runtime configuration, and cache shutdown.

## 14. Outstanding Questions

None.
