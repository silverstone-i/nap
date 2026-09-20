# M0001-12: Administrative Events

## 1. Document Control

| Field                | Value                                                   |
| -------------------- | ------------------------------------------------------- |
| Status               | Implemented                                             |
| Type                 | Module Work Unit                                        |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)       |
| Related architecture | [Admin and cells](../../../architecture/admin-cells.md) |
| Related PRDs         | M0001-01 through M0001-11                               |
| Related decisions    | Events are append-only and retained indefinitely        |
| Last reviewed        | 2026-09-20                                              |

## 2. Purpose

Record administrative actions in an append-only history that operators can use
to establish who did what and whether it succeeded.

## 3. Scope

### Included

- Event catalogue and validated payloads.
- Transactional event append for successful mutations.
- Authorized, filtered, paginated event reads.

### Excluded

- Table definitions and migrations.
- Cell-local audit events.
- Request logs, metrics, and arbitrary database-query logging.

## 4. Actors And Permissions

| Actor                         | Target                                        | Result                     |
| ----------------------------- | --------------------------------------------- | -------------------------- |
| Originating operation         | Valid catalogue event                         | Append event               |
| Root user or `platform_admin` | Any central event                             | Read event                 |
| `support`                     | Event not associated with Napsoft tenant data | Read event                 |
| `tenant_admin`                | Event associated with own tenant              | Read tenant event          |
| Any runtime actor             | Existing event                                | Cannot update or delete it |

## 5. Concepts And Terminology

| Term              | Meaning                                                  |
| ----------------- | -------------------------------------------------------- |
| Event key         | Stable dotted name for an administrative action          |
| Deduplication key | UUID identifying one logical event across retries        |
| Real actor        | Portal user who initiated the action                     |
| Effective user    | Tenant user whose context was used during support access |

## 6. Functional Requirements

- M0001-12-R001: Originating operations must record the applicable event keys in the catalogue below.
- M0001-12-R002: The append method must validate the key, outcome, attribution, target, and detail allowlist before insertion.
- M0001-12-R003: Runtime roles must not update or delete events.
- M0001-12-R004: Authorized readers must filter events by permitted tenant scope before pagination.

| Area           | Event keys                                                                                                                                                                                                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bootstrap      | `bootstrap.succeeded`, `bootstrap.failed`                                                                                                                                                                                                                                    |
| Authentication | `auth.login.succeeded`, `auth.login.failed`, `auth.login.throttled`, `auth.password.changed`                                                                                                                                                                                 |
| Sessions       | `session.created`, `session.rotated`, `session.revoked`, `session.expired`                                                                                                                                                                                                   |
| Authorization  | `role.initialized`, `role.granted`, `role.revoked`                                                                                                                                                                                                                           |
| Cells          | `cell.registered`, `cell.retry.requested`, `cell.provisioning.failed`, `cell.provisioning.completed`, `cell.disabled`                                                                                                                                                        |
| Tenants        | `tenant.created`                                                                                                                                                                                                                                                             |
| Accounts       | `user.created`, `user.updated`, `user.disabled`, `user.archived`, `user.restored`, `membership.created`, `membership.suspended`, `membership.activated`, `membership.archived`, `membership.restored`, `membership.provisioning.failed`, `membership.provisioning.completed` |
| Access         | `tenant.selected`, `support.entered`, `support.exited`, `support.denied`                                                                                                                                                                                                     |
| Entitlements   | `entitlement.granted`, `entitlement.withdrawn`                                                                                                                                                                                                                               |
| Cache          | `cache.revision.failed`                                                                                                                                                                                                                                                      |

## 7. Business Rules And Invariants

- M0001-12-R005: An event outcome must match the originating operation and must never claim success for a rolled-back action.
- M0001-12-R006: Support events and actions in support context must retain the real actor and any effective user.
- M0001-12-R007: Event fields and details must not contain passwords, password hashes, session tokens, connection strings, raw throttle inputs, or provider secrets.

Successful mutation events append in the source transaction. Denied and failed
attempts append in a separate transaction after the source transaction has
failed or rolled back. If a required event cannot be written, a successful
mutation rolls back and returns `503 AUDIT_UNAVAILABLE`.

The originating operation supplies one stable deduplication UUID. Repeating the
same logical operation returns the existing event. Events are retained
indefinitely and have no update, archive, delete, or purge API.

Many events have no tenant: bootstrap, cell registration, and a session created
before tenant selection all store a null tenant.

| Reader scope                      | Tenant events           | Null-tenant events |
| --------------------------------- | ----------------------- | ------------------ |
| Every tenant                      | All                     | Readable           |
| Every tenant, with denied tenants | All but the denied ones | Readable           |
| Named tenants                     | Only the named ones     | Not readable       |
| No tenant                         | None                    | Not readable       |

A named-tenant reader is fail-closed, so `tenant_admin` reads its own tenant's
events and nothing else. `support` keeps platform visibility because its scope
covers every tenant apart from the Napsoft tenants it is denied.

## 8. Lifecycle And State Transitions

| Situation                 | Result                                      |
| ------------------------- | ------------------------------------------- |
| Successful mutation       | Source and event commit together            |
| Denied or failed attempt  | Append failure or denial after rollback     |
| Retried logical operation | Reuse deduplication key; no duplicate event |
| Existing event            | Read only                                   |

## 9. Data Requirements

This Work Unit uses `admin.managed_events`. M0001-00 defines its append-only
schema, indexes, and deduplication constraint.

## 10. API Requirements

No HTTP route is introduced. `GET /api/admin-tenancy/v1/events` needs an
authenticated caller to resolve a scope from, so it lands with the
authentication and session Work Units and exposes `listEvents` below.

| Internal operation      | Input                                                                            | Result                            |
| ----------------------- | -------------------------------------------------------------------------------- | --------------------------------- |
| `append(event, { tx })` | Catalogue event, outcome, attribution, target, details, deduplication UUID       | Stored event, or the existing one |
| `listEvents`            | Scope and `tenant`, `actor`, `event`, `outcome`, `from`, `to`, `cursor`, `limit` | Authorized event page             |

Limits default to 50 and cannot exceed 100. Sort order is `occurred_at DESC,
id DESC`. Cursors are opaque and bound to the filters and scope that issued
them, so a caller cannot widen a query part-way through a page. A caller cannot
infer whether a filtered-out Napsoft event exists.

Invalid keys, outcomes, attribution, targets, or details return `INVALID_INPUT`;
an unauthorized scope returns `FORBIDDEN`; a write conflict returns `CONFLICT`;
an event that cannot be stored returns `AUDIT_UNAVAILABLE`, which a source
transaction surfaces as `503`. There is no event write, update, or delete
route.

## 11. Cross-Module Interactions

WUs 2–11 append their listed events. WU 1 reads do not create events. Cell
modules own their local audit history; a central event does not prove that a
cell-side operation completed.

## 12. Security And Audit

The event table is itself security-sensitive. Responses apply the same tenant
scope as the recorded action and return only allowlisted detail keys. Database
errors are redacted before any failure event is attempted.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                   | Requirements                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| AC01      | The catalogue names every listed key, and `append` accepts each one with its permitted outcomes. Each source Work Unit verifies its own emission. | M0001-12-R001, M0001-12-R005 |
| AC02      | Invalid keys, outcomes, attribution, or detail fields are rejected.                                                                               | M0001-12-R002                |
| AC03      | Runtime update and delete attempts fail and no purge path exists.                                                                                 | M0001-12-R003                |
| AC04      | Readers receive only permitted events with stable filtering and pagination.                                                                       | M0001-12-R004                |
| AC05      | Support activity retains real and effective actors and support cannot infer Napsoft events.                                                       | M0001-12-R006                |
| AC06      | Events contain none of the prohibited secrets or raw identifiers.                                                                                 | M0001-12-R007                |
| AC07      | Transaction failure, event-storage failure, and operation retry follow the atomicity and deduplication rules.                                     | M0001-12-R005                |

### Verification Evidence

Local validation on 2026-09-19: `npm run lint`, `npm run format:check`,
`npm test` (216 tests across the workspace, including 69 new unit tests),
`npm run build`, `npm run licenses`, and `git diff --check` passed.

`npm run test:db` passed 37 of 40 tests against a disposable PostgreSQL 18
server, including all 10
[administrative event tests](../../../../apps/api/tests/integration/administrative-events.test.js).
The three failures are in `admin-foundation.test.js` and predate this Work
Unit: the same three fail on an unmodified checkout, because the local fixture
server has no `postgres` superuser role. They do not touch `managed_events`.

Integration tests cover append inside and outside a transaction, rollback with
the source transaction, deduplication-key reuse, update and delete rejection,
pagination across pages, every filter, the reader-scope table including
null-tenant events, support attribution, and rejection storing nothing. Unit
tests cover the catalogue, the detail allowlist and its secret denylist,
attribution and target validation, scope-to-filter translation, cursor binding,
and error-code translation without database detail.

Pagination reads the position as microsecond text rather than through
`findAfterCursor`. That helper builds its cursor from the returned row, where
`occurred_at` has already become a millisecond-precision JavaScript `Date`; an
integration test caught it skipping rows inside the truncated remainder.

## 14. Outstanding Questions

None.
