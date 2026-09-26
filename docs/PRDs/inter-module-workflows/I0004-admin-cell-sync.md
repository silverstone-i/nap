# I0004: Admin-Cell Sync

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Implemented                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Type                 | Inter-module workflow                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Related architecture | [Admin and cells](../../architecture/admin-cells.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Related PRDs         | [M0001-03: Authentication](../modules/M0001-admin-tenancy/M0001-03-authentication.md), [M0001-04: Session Management](../modules/M0001-admin-tenancy/M0001-04-session-management.md), [M0001-07: Tenant Creation](../modules/M0001-admin-tenancy/M0001-07-tenant-creation.md), [M0001-08: Portal User And Membership Administration](../modules/M0001-admin-tenancy/M0001-08-portal-user-and-membership-administration.md), [M0001-10: Module Entitlements](../modules/M0001-admin-tenancy/M0001-10-module-entitlements.md), [M0001-12: Administrative Events](../modules/M0001-admin-tenancy/M0001-12-administrative-events.md), [M0002: Cell Tenancy](../modules/M0002-cell-tenancy.md), [I0003: Cell Provisioning](I0003-cell-provisioning.md) |
| Related decisions    | One sync worker inside the API delivers both directions; portal access is driven from the tenant's user record                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Last reviewed        | 2026-09-26                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

## 2. Purpose

The admin database and each cell hold facts the other needs, and neither can
query the other (M0002):

- **Admin to cell.** A cell keeps copies of its tenants, memberships, and
  module entitlements, and they must follow every admin change.
- **Cell to admin.** A tenant turns portal access on or off on one of its user
  records, and the admin database must create, reuse, or suspend the login and
  membership to match.

This PRD builds both directions on one mechanism. A change writes an outbox
row in its own transaction. One worker inside the API claims rows from
`admin.outbox` and from every ready cell's `cell.outbox`, applies each to the
other database, and retries until it succeeds. Neither side waits on the
other, and a database that is down catches up when it returns.

## 3. Scope

### Included

- One sync worker with one delivery engine: claiming, per-tenant ordering,
  superseding, retry, backoff, and failure events. Each direction supplies
  only its source outbox, its target, and its apply step.
- Admin to cell:
  - an `admin.outbox` row in the transaction of each admin write that
    increments a synced row's `revision` (R010);
  - the cell-side apply for `cell.tenants`, `cell.tenant_members`, and
    `cell.module_entitlements`;
  - a backfill that enqueues the current state of every synced row.
- Cell to admin:
  - `requestPortalAccess(tx, request, options)`, which a cell-side caller runs inside
    its own transaction to append a `portal_access` row to `cell.outbox`;
  - the admin-side apply that creates, reuses, or suspends the login and
    membership;
  - the result written back to the request row, and the resulting membership
    delivered to the cell through the admin-to-cell direction.

### Excluded

- The tenant user records, their `is_portal_user` flag, and the screens that
  change it. The Business Directory module owns them and calls
  `requestPortalAccess`. Until it exists, tests seed user records and call the
  function directly.
- Tenant context (`withTenantTransaction`) and its checks against the copies.
- Blocking routes for modules a tenant is not entitled to.
- Napsoft operations on logins: password reset, unlock, disable, email change,
  cross-tenant view, and retrying a failed request.
- Tenant suspend, archive, and reinstate, and their effect on portal access.
- Activating pending memberships on a login's first password change.
- Assigning tenants other than Napsoft to cells, and moving a tenant between
  cells. When assignment exists, the backfill (R019) delivers the tenant.
- Replacing M0001-08's admin-first membership provisioning
  (`admin.provisioning_jobs`). Both paths write the same membership row and
  both produce outbox rows under R010.
- A screen for outbox state. Failures are visible as managed events (R034).

## 4. Actors And Permissions

| Actor                 | Permission                                        | Can do                                                                                                                           |
| --------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Admin write operation | The permission its own PRD requires               | Write the `admin.outbox` row inside its transaction                                                                              |
| Cell-side caller      | Its own route permission (Business Directory)     | Call `requestPortalAccess` inside its tenant transaction                                                                         |
| Sync worker           | Trusted in-process runner; `nap-app` on each cell | Claim and update both outboxes; write the cell copies; write admin logins and memberships through admin-tenancy domain functions |

No route is added, so no user capability changes.

## 5. Concepts And Terminology

| Term                  | Meaning                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Outbox row            | A pending change in `admin.outbox` or `cell.outbox`. Both tables have the same columns                             |
| Direction             | Admin to cell (source `admin.outbox`) or cell to admin (source `cell.outbox`)                                      |
| Topic                 | What a row describes: `tenant`, `membership`, or `entitlement` from admin; `portal_access` from a cell             |
| Synced row            | A row of `admin.tenants`, `admin.portal_user_tenants`, or `admin.module_entitlements`                              |
| Entity                | The row's `entity_id`: the synced admin row's ID, or for `portal_access` the tenant user record's ID (`member_id`) |
| Revision              | A per-entity counter. Every change to an entity writes a row with the next revision                                |
| Snapshot              | The row's `payload`: the entity's full state as of that revision. Never a diff                                     |
| Superseded            | A pending row whose entity has a pending row with a higher revision                                                |
| Target cell           | The cell named by the tenant's `admin.tenants.cell_id` at delivery time                                            |
| Portal-access request | A `portal_access` row: "this user record should, or should not, be able to sign in to this tenant"                 |
| Pending invitation    | A login whose temporary password has not been changed (`must_change_password = true`)                              |
| Soft delete           | Setting `deactivated_at` instead of removing the row; restoring clears it                                          |

## 6. Functional Requirements

### Delivery engine (both directions)

- I0004-R001: The API must start one sync worker at startup in `dev` and
  `prod`, after the runtime cell registry has loaded, and must not start it in
  `test`. The worker runs one pass, a tick, every second.
- I0004-R002: Each tick, the worker must read `admin.outbox` and the
  `cell.outbox` of every ready cell for `pending` rows whose `next_attempt_at`
  has passed, up to 100 rows per outbox.
- I0004-R003: The worker must process one tenant and direction at a time
  under a lock keyed by (direction, tenant ID) that another process skips
  rather than waits on, so two API instances never deliver the same tenant's
  rows in the same direction at once.
- I0004-R004: Before applying, the worker must mark superseded rows
  `delivered` without applying them. Only the highest pending revision per
  entity is applied.
- I0004-R005: The worker must apply a tenant's rows in one target
  transaction, ordered by topic (R009 for admin to cell) and then by
  ascending revision.
- I0004-R006: After the target transaction commits, the worker must mark each
  applied row `delivered` with `delivered_at` set and `failure_code` cleared.
- I0004-R007: A retryable failure (R031) must leave the tenant's rows
  `pending`, increment `attempts`, record `failure_code`, and set
  `next_attempt_at` to now plus `min(2^attempts, 300)` seconds. A failure for
  one tenant or cell must not delay another.
- I0004-R008: On shutdown, the worker must finish the tenant it is applying
  and leave every other row `pending`.

### Admin to cell: writing changes

- I0004-R009: Topics apply in the order `tenant`, `membership`,
  `entitlement`.
- I0004-R010: Every write that changes a synced row's copied fields or its
  soft-delete state must increment that row's `revision` by one in the same
  transaction; a new row starts at 1, and a caller-supplied `revision` is
  ignored. The three synced tables' models enforce this for every write
  method (`RevisionedTableModel`), so it covers the portal-access apply
  (R024–R028) and any later write. An operation made of two writes, such as
  restoring a membership and then setting its status, increments twice.
- I0004-R011: The same transaction must insert one `admin.outbox` row with
  `tenant_id`, `topic`, `entity_id`, the new `revision`, and the snapshot. If
  the insert fails, the admin change rolls back.
- I0004-R012: A write that changes no copied field (for example, only `ready`
  or `provisioned`) must not increment `revision` or write an outbox row.
- I0004-R013: Admin snapshots must hold exactly these fields:

  | Topic         | Payload fields                                                                              |
  | ------------- | ------------------------------------------------------------------------------------------- |
  | `tenant`      | `id`, `tenant_code`, `status`, `deactivated_at`                                             |
  | `membership`  | `id`, `tenant_id`, `portal_user_id`, `member_type`, `member_id`, `status`, `deactivated_at` |
  | `entitlement` | `id`, `tenant_id`, `module`, `enabled`                                                      |

### Admin to cell: applying

- I0004-R014: The worker must find the target cell from
  `admin.tenants.cell_id` at delivery time and take its connection from the
  I0003 registry, never from the outbox row.
- I0004-R015: For each snapshot, the cell transaction must lock the copy by
  ID, insert it if absent, update it if the snapshot's revision is greater,
  and otherwise leave it unchanged. The copy's `revision` must equal the
  applied snapshot's.
- I0004-R016: A snapshot with `deactivated_at` set must soft-delete the copy;
  one with `deactivated_at` null must restore a soft-deleted copy.
- I0004-R017: The copy's `created_by` and `updated_by` must be the outbox
  row's `created_by`: the admin actor, or null for system writes.
- I0004-R018: A `membership` or `entitlement` snapshot whose tenant has no
  `cell.tenants` row must fail the tenant's delivery with `TENANT_NOT_SYNCED`.
- I0004-R019: At worker start, and when the Napsoft tenant is first assigned
  a cell, the worker must insert an `admin.outbox` row with the current
  revision and snapshot for every synced row of each affected tenant,
  skipping any (`topic`, `entity_id`, `revision`) that already exists.

### Cell to admin: writing requests

- I0004-R020: `requestPortalAccess(tx, request, options)` must take the
  caller's cell transaction, `{ tenantId, memberId, memberType, email,
enabled, temporaryPassword }`, and an optional `{ hashingPolicy }` that
  defaults to the environment's Argon2 settings. It must insert a
  `portal_access` row into `cell.outbox` with `entity_id = memberId`, the next
  revision for that entity, and the request as the snapshot. The row commits
  or rolls back with the caller's change.
- I0004-R021: `requestPortalAccess` must reject a `memberType` outside
  `employee`, `client`, `vendor_contact`, `contact`, or an email that is not a
  valid address, with `INVALID_INPUT`, before inserting. When `enabled` is
  true, `temporaryPassword` is required and must pass
  `parseTemporaryPassword`; when false, it must be absent.
- I0004-R022: `requestPortalAccess` must hash `temporaryPassword` with
  `hashPassword` under the admin hashing policy before inserting. The
  plaintext must never be written to the cell, the outbox, logs, or events.
- I0004-R023: The request snapshot must hold exactly `tenant_id`,
  `member_id`, `member_type`, `email`, `enabled`, and, when `enabled` is
  true, `password_hash`. It must never hold a plaintext password.

### Cell to admin: applying

- I0004-R024: The worker must apply each request in one admin transaction
  through admin-tenancy domain functions, finding the login by email
  case-insensitively among unarchived logins, and the membership by
  (`portal_user_id`, `tenant_id`). The tenant comes from the cell the row was
  read from, never from the payload. A payload `tenant_id` that differs from
  the row's, or a row whose tenant is not assigned to the cell it was read
  from, must fail the row with `TENANT_MISMATCH`.
- I0004-R025: Access on, no login with that email: create a login with
  the request's `password_hash` and `must_change_password = true`, and a
  `pending` membership with the request's `member_type` and `member_id`.
- I0004-R026: Access on, login exists: create or reuse the membership with the
  request's `member_type` and `member_id`, as `active` if the login has an
  active membership in another tenant, and `pending` otherwise. The password
  changes only as follows:

  | Login state                                 | Password                                                              |
  | ------------------------------------------- | --------------------------------------------------------------------- |
  | Has an active membership                    | Unchanged                                                             |
  | No active membership, pending invitation    | Unchanged; `portal_access.applied` records `invitation_pending: true` |
  | No active membership, no pending invitation | Set to `password_hash`; `must_change_password = true`                 |

- I0004-R027: Access on, login disabled or root: fail the row with
  `LOGIN_UNAVAILABLE` and change nothing.
- I0004-R028: Access off: suspend the membership and revoke only the sessions
  that selected this tenant (M0001-04). With no membership, succeed and
  change nothing.
- I0004-R029: A membership reused for a different `member_id` than the
  request's must fail the row with `MEMBER_CONFLICT`.
- I0004-R030: The result reaches the cell two ways: the request row's
  `status` and `failure_code`, and the membership change's own
  `admin.outbox` row (R010), which updates `cell.tenant_members`.

### Failures

- I0004-R031: These failures are retryable:

  | Condition                                       | `failure_code`      |
  | ----------------------------------------------- | ------------------- |
  | Tenant has no `cell_id`                         | `CELL_NOT_ASSIGNED` |
  | Registry reports the cell not ready             | `CELL_UNAVAILABLE`  |
  | Target transaction fails or times out           | `DELIVERY_FAILED`   |
  | Membership or entitlement before its tenant row | `TENANT_NOT_SYNCED` |

- I0004-R032: These failures must mark only that row `failed` and must not
  block the tenant's other rows: `INVALID_PAYLOAD` (a snapshot that fails
  R013 or R023), `TENANT_MISMATCH`, `LOGIN_UNAVAILABLE`, and
  `MEMBER_CONFLICT`. `failed` is final; a new request is a new revision.

## 7. Business Rules And Invariants

- I0004-R033: For every entity, the target must eventually reflect the
  source's highest revision. Duplicate, repeated, and out-of-order deliveries
  must not change the result (R004, R015).
- The worker connects to cells only as `nap-app` (I0003-R038).
- The target transaction commits before the source rows are marked
  `delivered`. If the source commit then fails, a later tick applies the rows
  again. Copies and memberships end the same, but a request that reset a
  password resets it again.

## 8. Lifecycle And State Transitions

Outbox row, either direction:

| State     | Trigger                                | Result                                             |
| --------- | -------------------------------------- | -------------------------------------------------- |
| (none)    | Source change, request, or backfill    | `pending`, `attempts = 0`, `next_attempt_at = now` |
| `pending` | Higher revision pending for the entity | `delivered` without being applied (R004)           |
| `pending` | Target transaction commits             | `delivered`, `delivered_at` set                    |
| `pending` | Retryable failure (R031)               | `pending`, `attempts + 1`, later `next_attempt_at` |
| `pending` | Row failure (R032)                     | `failed` with its code                             |
| `pending` | API stops                              | `pending`                                          |

Membership, from a portal-access request:

| State                 | Request                                      | Result      |
| --------------------- | -------------------------------------------- | ----------- |
| None or `suspended`   | On; login has an active membership elsewhere | `active`    |
| None or `suspended`   | On; otherwise                                | `pending`   |
| `pending` or `active` | On                                           | Unchanged   |
| `pending` or `active` | Off                                          | `suspended` |
| None or `suspended`   | Off                                          | Unchanged   |

## 9. Data Requirements

No schema change. Both outboxes and the three cell copies exist
(M0001-00-01, M0002-01). Delivered rows are kept; pruning is not in scope.

The worker writes:

- `admin.outbox` and `cell.outbox`: `status`, `attempts`, `next_attempt_at`,
  `delivered_at`, `failure_code`;
- `cell.tenants`, `cell.tenant_members`, `cell.module_entitlements`;
- `admin.portal_users` and `admin.portal_user_tenants`, through
  admin-tenancy domain functions.

Delivered `portal_access` rows keep `password_hash`, because `payload` is
immutable. It is a one-way Argon2 hash of a password the user must change at
first sign-in. Passwordless sign-in, once messaging exists, removes it.

## 10. API Requirements

No HTTP route is added or changed. Existing admin routes gain the outbox write
inside their transactions and keep their responses.

`requestPortalAccess` is the only new entry point, exported for cell-side
module code.

## 11. Cross-Module Interactions

- M0001-07, M0001-08, and M0001-10 own their writes and permissions. Their
  models increment `revision` (R010) and write the outbox row with it.
- M0001-08 owns logins and memberships. The portal-access apply goes through
  admin-tenancy's domain rather than writing the tables directly; this PRD
  adds `createLoginFromHash` and `applyPortalAccess` there.
- M0001-04 owns session revocation, used by R028.
- M0002 owns both cell tables this PRD reads and writes.
- I0003's registry supplies each cell's connection and readiness.
- The Business Directory module calls `requestPortalAccess` when a user's
  portal access flag changes or the user is archived.
- M0001-12 owns managed events; this PRD adds the keys in R034.

## 12. Security And Audit

- I0004-R034: The worker must record `sync.delivery.failed` on the first
  retryable failure for a tenant and direction and every tenth attempt after,
  `sync.delivery.recovered` when that tenant and direction next delivers, and
  `portal_access.applied` or `portal_access.failed` for each request. Each
  event's `tenant_id` is the tenant and its `target_id` the entity; `details`
  hold only `direction`, `failure_code`, `attempts`, and
  `invitation_pending`.
- I0004-R035: Snapshots, failure codes, events, and logs must not contain
  plaintext passwords, connection strings, or endpoints. Email and
  `password_hash` appear only in the `portal_access` snapshot, and never in
  logs or events.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                                                                                                                           | Requirements                 |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| AC01      | Suspending, activating, archiving, and restoring a Napsoft membership each reach `cell.tenant_members` with the admin revision, with no restart.                                                                                                          | I0004-R010, R011, R015, R016 |
| AC02      | Granting and withdrawing an entitlement reach `cell.module_entitlements`.                                                                                                                                                                                 | I0004-R010, R011, R015       |
| AC03      | A failed outbox insert rolls back the admin change; a failed `requestPortalAccess` rolls back the caller's change.                                                                                                                                        | I0004-R011, R020             |
| AC04      | A write that changes only `ready` adds no outbox row and no revision.                                                                                                                                                                                     | I0004-R012                   |
| AC05      | With the cell stopped, admin changes commit and retry with growing delays; after it starts, the copies match admin.                                                                                                                                       | I0004-R007, R031, R033       |
| AC06      | Delivering rows twice, or an older revision after a newer one, leaves the target at the newer revision.                                                                                                                                                   | I0004-R004, R015, R033       |
| AC07      | A membership row applied before its tenant row fails with `TENANT_NOT_SYNCED` and succeeds once the tenant row lands.                                                                                                                                     | I0004-R009, R018             |
| AC08      | Two workers never deliver the same tenant and direction at once.                                                                                                                                                                                          | I0004-R003                   |
| AC09      | Worker start backfills memberships that existed before worker start; a second start inserts nothing.                                                                                                                                                      | I0004-R019                   |
| AC10      | With a seeded tenant user, a portal-access-on request for a new email creates a login that signs in with the temporary password and must change it. Its `pending` membership, with `portal_user_id` and `member_id`, reaches `cell.tenant_members`.       | I0004-R020, R025, R030, R022 |
| AC11      | An on request for an email with an active membership in another tenant creates an `active` membership and leaves the password unchanged; one for a login with a pending invitation leaves that password unchanged and records `invitation_pending: true`. | I0004-R026                   |
| AC12      | An off request suspends the membership and revokes only this tenant's sessions.                                                                                                                                                                           | I0004-R028                   |
| AC13      | Requests for a disabled login, the root login, a conflicting `member_id`, or a mismatched tenant fail only that row, with its code.                                                                                                                       | I0004-R024, R027, R029, R032 |
| AC14      | An on request followed by an off request for the same user before delivery applies only the off request.                                                                                                                                                  | I0004-R004                   |
| AC15      | Failures and recoveries record their events; no event, log, or snapshot contains a plaintext password, connection string, or endpoint.                                                                                                                    | I0004-R034, R035             |
| AC16      | Every write method on the three synced tables increments `revision` exactly when a copied column or soft-delete state changes, ignores a supplied `revision`, and serializes concurrent upserts of one new row.                                           | I0004-R010, R012             |

## 14. Decisions

- The backfill (R019) runs on every worker start and inserts nothing when
  every current revision is already in `admin.outbox`.
- Rows that keep failing retryably stay `pending` and retry at most every
  5 minutes, recording `sync.delivery.failed` every tenth attempt.
