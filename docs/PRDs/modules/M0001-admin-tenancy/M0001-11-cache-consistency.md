# M0001-11: Cache Consistency

## 1. Document Control

| Field                | Value                                               |
| -------------------- | --------------------------------------------------- |
| Status               | Draft                                               |
| Type                 | Module Work Unit                                    |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)   |
| Related architecture | [BFF](../../../architecture/bff.md)                 |
| Related PRDs         | M0001-01 through M0001-10                           |
| Related decisions    | PostgreSQL remains authoritative; Redis is optional |
| Last reviewed        | 2026-09-18                                          |

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
- M0001-11-R002: Every authorization-relevant admin mutation must advance all affected revision keys in the source transaction.
- M0001-11-R003: Consumers must reuse a cached value only when every stored revision matches PostgreSQL.
- M0001-11-R004: Correct behavior must continue when Redis is absent or unavailable.

| Domain        | Entity                                            | Advanced by                                           |
| ------------- | ------------------------------------------------- | ----------------------------------------------------- |
| `user`        | Portal-user UUID                                  | Account, password, or eligibility change              |
| `session`     | Session UUID                                      | Create, rotate, context change, expiry, or revocation |
| `roles`       | Portal-user UUID                                  | Any portal-user role grant or removal                 |
| `membership`  | Portal-user UUID and tenant UUID as separate keys | Membership change                                     |
| `tenant`      | Tenant UUID                                       | Tenant state, assignment, or readiness change         |
| `cell`        | Cell UUID                                         | Registry, enabled, or provisioning change             |
| `entitlement` | Tenant UUID                                       | Entitlement change                                    |

## 7. Business Rules And Invariants

- M0001-11-R005: A successful source mutation and its revision advances must commit or roll back together.
- M0001-11-R006: Cache keys must include every user, tenant, role, session, and entitlement dimension that affects the result.

The first advance inserts revision `1`; later advances use `revision + 1` under
row locking. Counters are 64-bit integers. Cache fill reads source data and its
revision vector in one transaction, then writes Redis after commit.

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

| Internal operation                  | Result                                              |
| ----------------------------------- | --------------------------------------------------- |
| `current(keys)`                     | Complete ordered revision vector or storage failure |
| `advance(keys, tx)`                 | New revisions inside the source transaction         |
| `getOrLoad(cacheKey, keys, loader)` | Valid cached value or authoritative result          |

The operations do not retry failed source transactions. The originating command
may retry the entire idempotent operation.

## 11. Cross-Module Interactions

Every source Work Unit calls `advance` for its listed keys. Role definitions
live in cells; authorization caches must also validate the owning cell's role
revision before reusing resolved capabilities. Definition changes, role removal,
and reviewed system-role updates must invalidate dependent authorization.
If the relevant cell revision cannot be verified, cached authority must not be
used. Cell-local revision storage and delivery belong to access-control's
integration contract; an Admin assignment revision alone is insufficient.

## 12. Security And Audit

Cache payload access follows the source record's authorization scope. Cache keys
contain opaque UUIDs, not emails, names, passwords, tokens, or reasons. Revision
failures record a managed event; ordinary cache hits and fills do not.

## 13. Acceptance Criteria

| Criterion | Required result                                                                          | Requirements                 |
| --------- | ---------------------------------------------------------------------------------------- | ---------------------------- |
| AC01      | Every domain can initialize, read, and advance a monotonic revision.                     | M0001-11-R001                |
| AC02      | Each listed mutation advances its affected keys in the source transaction.               | M0001-11-R002, M0001-11-R005 |
| AC03      | Missing or mismatched vectors prevent cache reuse.                                       | M0001-11-R003                |
| AC04      | Redis failure falls back to PostgreSQL; PostgreSQL failure does not use stale authority. | M0001-11-R004                |
| AC05      | Cross-user, cross-tenant, and cross-session cache reuse is impossible.                   | M0001-11-R006                |

## 14. Outstanding Questions

None.
