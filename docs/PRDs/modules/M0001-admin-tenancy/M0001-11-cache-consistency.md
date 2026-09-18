# M0001-11: Cache Consistency

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Status               | Draft                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Type                 | Module work unit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Owner                | To be confirmed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Related architecture | [BFF](../../../architecture/bff.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Related PRDs         | [M0001-01: Tenant and Portal-User Foundation](M0001-01-tenant-and-portal-user-foundation.md), [M0001-03: Authentication](M0001-03-authentication.md), [M0001-04: Session Management](M0001-04-session-management.md), [M0001-05: Authorization](M0001-05-authorization.md), [M0001-06: Cell Management](M0001-06-cell-management.md), [M0001-07: Tenant Creation](M0001-07-tenant-creation.md), [M0001-08: Portal-User and Membership Administration](M0001-08-portal-user-and-membership-administration.md), [M0001-09: Tenant Selection and Support Access](M0001-09-tenant-selection-and-support-access.md), [M0001-10: Module Entitlements](M0001-10-module-entitlements.md), [M0001-12: Administrative Events](M0001-12-administrative-events.md) |
| Related decisions    | None recorded separately; unresolved decisions are in section 14                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Last reviewed        | 2026-09-18                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## 2. Purpose

Invalidate cached central identity, authorization, tenant, entitlement, and
routing decisions when their authoritative admin records change.

## 3. Scope

### Included

- Persistent central cache revisions and their update/read contracts.
- Mapping admin mutations to affected cached decisions.
- Cache validation and behavior when cached data is stale or unavailable.

### Excluded

- Cell-local cache revisions and invalidation.
- Projection delivery and cell-side enforcement.
- Requiring Redis for correct admin behavior.

## 4. Actors And Permissions

| Context                         | Actor                     | Required authority or condition                 | Result                                    |
| ------------------------------- | ------------------------- | ----------------------------------------------- | ----------------------------------------- |
| Advance affected revision       | Authorized admin mutation | Source data change within the operation's scope | Apply the agreed revision update          |
| Validate cached data            | Application runtime       | Trusted cache-consumer context                  | Compare against central revision contract |
| Set or reset revisions directly | Browser caller            | No public revision-management authority         | Reject direct manipulation                |
| Cache unavailable               | Application runtime       | Source-of-truth access available                | Follow the agreed authoritative-read path |

Revision changes derive from authorized source operations; they are not a new
platform privilege users can assign to themselves.

## 5. Concepts And Terminology

| Term           | Meaning                                                                           |
| -------------- | --------------------------------------------------------------------------------- |
| Cache revision | Persisted value identifying the version of central data used by a cached decision |
| Invalidation   | Making a cached result ineligible for reuse after a relevant change               |
| Cache scope    | The identity, tenant, capability, or other boundary covered by one revision       |
| Stale result   | Cached data whose validation no longer satisfies the central revision contract    |

## 6. Functional Requirements

- M0001-11-R001: The module must persist central cache revisions in `admin.cache_revisions` and expose revision read and advancement operations.
- M0001-11-R002: Each relevant admin mutation must invalidate the cached decisions identified by the change-impact table below.
- M0001-11-R003: Cache consumers must validate freshness under the agreed revision contract and must not use a result known to be stale as current authority.
- M0001-11-R004: PostgreSQL must remain authoritative, and correct central behavior must not depend on Redis being available.

## 7. Business Rules And Invariants

- M0001-11-R005: Revision updates and source changes must meet the agreed freshness bound even when mutations compete or cache operations fail.
- M0001-11-R006: Cache keys and revision checks must preserve the identity, tenant, and authorization scope of the decision.

Atomicity, freshness bounds, cache-key dimensions, revision values, and failure
behavior are decisions in Q01–Q03.

| Source change                                         | Decisions requiring invalidation                           | Source owner                      |
| ----------------------------------------------------- | ---------------------------------------------------------- | --------------------------------- |
| Portal-user identity or authentication eligibility    | Cached identity and authentication eligibility             | Units 2, 3, 8                     |
| Session lifecycle or selected/support context         | Cached session resolution and context                      | Units 4, 9                        |
| System-role capability release or platform assignment | Cached platform authorization                              | Unit 5                            |
| Membership state                                      | Cached membership, selection, and related access decisions | Unit 8                            |
| Tenant state or central assignment data               | Cached tenant eligibility and routing                      | Unit 7 and assignment integration |
| Cell registry/enabled state                           | Cached central routing eligibility                         | Unit 6                            |
| Module entitlement                                    | Cached tenant module availability                          | Unit 10                           |

Unit 1's low-level writes use the originating operation's contract. Cell runtime
health and cell-local projection changes need their own receiving-owner contract.

## 8. Lifecycle And State Transitions

| Situation                        | Required behavior                                                            |
| -------------------------------- | ---------------------------------------------------------------------------- |
| No usable cached result          | Obtain authoritative data under Q02                                          |
| Relevant central mutation        | Advance or invalidate the affected scope under Q01                           |
| Cached revision fails validation | Do not reuse the result as current                                           |
| Cache service unavailable        | Preserve correct central behavior without Redis                              |
| Revision/source read fails       | Apply the agreed safe failure rules; do not silently trust unverifiable data |

Initialization, revision rollover, race handling, and cleanup remain open.

## 9. Data Requirements

| Table                   | Required meaning                                               | Access and sensitivity                                                          |
| ----------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `admin.cache_revisions` | Scope identity and revision value for central cached decisions | Read during validation; update with affected changes; internal consistency data |

Exact keys, counter/token type, uniqueness, transaction semantics, timestamps,
and retention require Q01. Cache entries are not the source of record, and this
PRD does not add a persistent cache-payload table.

## 10. API Requirements

| Internal operation       | Input                                           | Result                                   |
| ------------------------ | ----------------------------------------------- | ---------------------------------------- |
| Read revision            | Agreed central scope                            | Current revision or defined absence      |
| Invalidate source change | Authorized mutation context and affected scopes | Updated revision state                   |
| Validate cache result    | Result scope and observed revision              | Reusable, stale, or unverifiable outcome |

No public cache-administration route is introduced. Signatures, retries,
transaction participation, and database/cache failure results are open in Q02.
Mutating APIs reference this contract rather than inventing local freshness rules.

## 11. Cross-Module Interactions

All source units listed in the impact table integrate this contract before
claiming completion of their required invalidation behavior. The revision
contract therefore needs agreement before those mutations are implemented.

Cell-local revision stores and invalidation are separate roadmap dependencies.
W0003 owns projection propagation; this work unit does not use a central cache
revision as proof that a cell has applied a projection.

## 12. Security And Audit

[M0001-12: Administrative Events](M0001-12-administrative-events.md) defines which invalidation changes or failures require managed events;
ordinary cache hits are not automatically administrative events. Cache payloads
inherit their source data's sensitivity and access scope.

The effect of an unavailable authoritative store on security-sensitive reads is
an acceptance-blocking Q02 decision, not permission to use stale authority.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                  | Requirements                                                                 |
| --------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| AC01      | Revisions persist and can be read and advanced for the agreed scopes.                                            | M0001-11-R001                                                                |
| AC02      | Each source-change category in the impact table invalidates the relevant cached decision.                        | M0001-11-R002                                                                |
| AC03      | Old or mismatched revisions prevent reuse as current authority.                                                  | M0001-11-R003                                                                |
| AC04      | Admin behavior remains correct with Redis disabled or unavailable.                                               | M0001-11-R004                                                                |
| AC05      | Injected source/revision failures and competing mutations satisfy the agreed atomicity and freshness guarantees. | M0001-11-R005                                                                |
| AC06      | A cache result for one identity or tenant cannot be reused for a different scope.                                | M0001-11-R006                                                                |
| AC07      | The agreed invalidation changes and failures produce their required managed events.                              | [M0001-12-R001](M0001-12-administrative-events.md#6-functional-requirements) |

## 14. Open Questions

| ID  | Decision required before acceptance                                                                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q01 | What revision scopes, key structure, value type, initialization, transaction guarantees, and retention apply?                                        |
| Q02 | What are the read/update interfaces, validation timing, retry rules, and behavior when cache, revision reads, or authoritative data are unavailable? |
| Q03 | What freshness bound and concurrency guarantees apply to each decision category, including changes affecting active sessions?                        |
