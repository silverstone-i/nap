# F0002: Platform Administration Screens

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Draft                                                                                                                                                                                                                                                                                                                                                                                                     |
| Type                 | Feature                                                                                                                                                                                                                                                                                                                                                                                                   |
| Related architecture | [BFF](../../architecture/bff.md)                                                                                                                                                                                                                                                                                                                                                                          |
| Related PRDs         | [F0001: Application Entry and Shell](F0001-application-entry-and-shell.md), [M0001-06: Cell Management](../modules/M0001-admin-tenancy/M0001-06-cell-management.md), [M0001-07: Tenant Creation](../modules/M0001-admin-tenancy/M0001-07-tenant-creation.md), [M0001-08: Portal-user and Membership Administration](../modules/M0001-admin-tenancy/M0001-08-portal-user-and-membership-administration.md) |
| Related decisions    | Reuse cursor pagination (the module's existing convention) for every new list endpoint, and bridge it to `StandardDataGrid` with a frontend adapter rather than changing the module's pagination style or the shared grid component                                                                                                                                                                       |
| Last reviewed        | 2026-09-21                                                                                                                                                                                                                                                                                                                                                                                                |

## 2. Purpose

Give a platform operator list screens for the three record types the
platform shell's Tenant Management navigation group (F0001-R023) names —
Tenants, Cells, and Portal Users — using only lifecycle operations
M0001-06, M0001-07, and M0001-08 already implement. This closes F0001's own
flagged gap: `Tenant Management` renders hidden today because none of its
children are implemented.

## 3. Scope

### Included

- A Tenants list screen: browse central tenant records, and create one.
- A Cells list screen: browse cell registry and provisioning state,
  register a new cell, retry a failed provisioning attempt, and disable a
  cell.
- A Portal Users list screen: browse portal-user accounts, create one, and
  deactivate or restore one.
- Two new list API endpoints (`GET /tenants`, `GET /accounts/users`) that
  M0001-07 and M0001-08 do not yet expose, following the cursor-pagination
  shape `GET /control/overview` (M0001-06) already established. Cells needs
  no new endpoint.
- A frontend cursor-to-page pagination adapter so all three screens can use
  `StandardDataGrid` (F0001-R015–R017) unchanged, with an explicit,
  disclosed row-count estimate in place of an exact total the underlying
  API cannot provide.
- One new field on `GET /access/context` (F0001-R024, defined in F0001, not
  here) that this feature's nav visibility depends on.

### Excluded

- Tenant update, suspension, archive, and restore — M0001-07 §3 excludes
  the underlying capability; no such operation exists to expose.
- Membership creation, suspension, or assignment UI. `Portal Users` shows
  the top-level `portal_users` list only; M0001-08's membership endpoints
  are not consumed here.
- Role, permission, and capability administration (M0003's scope, blocked
  on cell provisioning).
- Detail pages for any of the three entities. Row actions act on the row's
  already-fetched fields; no per-row read-by-id call.
- The tenant/cell provisioning _workflow_ — creating a tenant, assigning it
  a cell, watching it provision and activate end to end. That sequencing is
  reserved on the roadmap as `W0001: Tenant Provisioning` and
  `W0002: Cell Provisioning`; this PRD only exposes the individual
  operations M0001-06/07 already implement (register, retry, disable,
  create), not the cross-module sequence between them.
- Bulk or multi-row actions beyond `StandardDataGrid`'s existing
  current-page-only checkbox selection (F0001-R016). No new bulk endpoint.
- Changing which capabilities exist or what they grant. `entryPoints.tenantManagement`
  (F0001-R024) only surfaces `permits()` results the server already computes.

## 4. Actors And Permissions

The server remains authoritative; this table restates existing M0001-06/07/08
authorization for the specific reads and actions this feature adds a screen
for.

| Context                                                | Actor                                                           | Required capability              | Result                                                          |
| ------------------------------------------------------ | --------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------- |
| `/management/tenants`                                  | Root or `platform_admin`                                        | `admin-tenancy::control::read`   | List tenants                                                    |
| `/management/tenants` (create)                         | Root or `platform_admin`, or `support` for a non-Napsoft tenant | `admin-tenancy::control::write`  | Create a tenant                                                 |
| `/management/cells`                                    | Root or `platform_admin`                                        | `admin-tenancy::control::read`   | List cells and their provisioning state                         |
| `/management/cells` (register/retry/disable)           | Root or `platform_admin`                                        | `admin-tenancy::control::write`  | Register, retry, or disable a cell                              |
| `/management/portal-users`                             | Root or `platform_admin`, or `support` per M0001-08-R007        | `admin-tenancy::accounts::read`  | List portal-user accounts                                       |
| `/management/portal-users` (create/deactivate/restore) | Root or `platform_admin`, `support` per M0001-08-R007           | `admin-tenancy::accounts::write` | Create, deactivate, or restore a portal-user account            |
| Any of the above                                       | Authenticated user without the capability                       | None                             | Destination hidden from navigation; direct access server-denied |

Per M0001-05's current status, `platform_admin`/`support` role assignment is
blocked on cell provisioning; today only root resolves either capability
(`resolveAuthorization`, `apps/api/src/modules/admin-tenancy/domain/authorization.js`).
This feature does not change that — it consumes whatever `permits()` already
returns, honestly, for whichever actor type resolves in the future.

## 5. Concepts And Terminology

| Term               | Meaning                                                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cursor page        | One page of an opaque, cursor-keyed list result: `{rows, nextCursor}`, the shape every list endpoint in this module uses                                                                               |
| Pagination adapter | Frontend logic that fetches cursor pages in sequence, caches the cursor for each page index it has visited, and exposes `StandardDataGrid`'s expected `{page, pageSize} -> {rows, rowCount}` interface |
| Row-count estimate | The adapter's `rowCount`: rows already fetched, plus one page's worth if the last fetch reported a further page — never a claim of an exact total                                                      |
| Registry read      | `GET /control/overview`'s existing per-row shape, `{cell, operation}` — the cell's registry state and its most recent provisioning operation, if any                                                   |

## 6. Functional Requirements

- F0002-R001: The Tenants screen must list tenants server-side via a new
  `GET /api/admin-tenancy/v1/tenants` endpoint, in a `StandardDataGrid`
  showing at minimum code, name, tier, and status, with explicit loading,
  empty, and error states (F0001-R021). It must provide no update, suspend,
  archive, or restore action, since none exists server-side.
- F0002-R002: The Tenants screen must provide a "Create tenant" action
  that submits `code`, `name`, and `tier` to the existing
  `POST /api/admin-tenancy/v1/tenants` contract with a client-generated
  `Idempotency-Key`, and must surface the server's validation and conflict
  responses without inventing new client-side tenant-uniqueness rules.
- F0002-R003: The Cells screen must list cells and their latest
  provisioning operation via the existing `GET /control/overview`, in a
  `StandardDataGrid` showing at minimum environment, database name,
  enabled state, and provisioning stage/status, with explicit loading,
  empty, and error states.
- F0002-R004: The Cells screen must provide Register (`POST /control/registry`),
  Retry (`POST /control/provision`, `cell-retry`), and Disable
  (`POST /control/provision`, `cell-disable`) actions using the existing
  contracts. Disable must require confirmation before it fires
  (F0001-R016's destructive-action pattern); Register and Retry, being
  non-destructive, must not.
- F0002-R005: The Portal Users screen must list portal-user accounts
  server-side via a new `GET /api/admin-tenancy/v1/accounts/users`
  endpoint, in a `StandardDataGrid` showing at minimum email, status, and
  whether a password change is required, with explicit loading, empty, and
  error states. It must not show or manage tenant memberships.
- F0002-R006: The Portal Users screen must provide Create
  (`POST /accounts/users`, `{email, password}`, with a client-generated
  `Idempotency-Key`), Deactivate (`DELETE /accounts/users/:id`), and
  Restore (`POST /accounts/users/:id/restore`) actions using the existing
  contracts. Deactivate must require confirmation before it fires; Create
  and Restore must not.
- F0002-R007: `GET /api/admin-tenancy/v1/tenants` must accept `cursor` and
  `limit` (1–100, default 50, matching `parseLimit`) query parameters,
  require `admin-tenancy::control::read`, and return
  `{rows: [tenantView...], nextCursor}` in the existing versioned envelope
  with `Cache-Control: no-store` — the same shape and column safety
  `tenantView` (`domain/tenants.js`) already provides for `POST /tenants`'
  response, reused verbatim, never a new field.
- F0002-R008: `GET /api/admin-tenancy/v1/accounts/users` must accept
  `cursor` and `limit` (1–100, default 50) query parameters, require
  `admin-tenancy::accounts::read`, and return
  `{rows: [userView...], nextCursor}` in the existing versioned envelope
  with `Cache-Control: no-store` — reusing `userView` (`domain/accounts.js`)
  verbatim, never a password hash or role assignment.
- F0002-R009: Each screen's pagination must be handled by one shared
  frontend adapter translating `StandardDataGrid`'s page-index requests into
  sequential cursor fetches, caching each visited page's cursor, and
  invalidating that cache whenever sort, filter, or the tenant/resetKey
  context changes — mirroring `StandardDataGrid`'s own `requestSignature`
  invalidation. The adapter's `rowCount` must be a disclosed estimate
  (rows fetched so far, plus one page if the server reports more), and the
  grid must present it as such (for example "25 of 25+"), never as an exact
  count the API does not provide.
- F0002-R010: Each of the three screens must appear in the platform shell's
  Tenant Management navigation group (F0001-R023) only when both its
  destination is implemented (this PRD) and `GET /access/context`'s
  `entryPoints.tenantManagement` (F0001-R024) reports that specific child
  as authorized. Neither condition alone is sufficient.

## 7. Business Rules And Invariants

- Server session resolution and request authorization remain the source of
  truth; the pagination adapter and nav-visibility check are UI convenience
  only, same as every other F0001 invariant already established.
- A row action never fabricates a request field this PRD did not name; the
  existing M0001-06/07/08 request/response contracts are reused exactly as
  specified in those PRDs, never redefined here.
- The row-count estimate must never be presented as an exact total.
- A destructive action (Disable, Deactivate) requires confirmation and
  cannot be triggered from a bulk selection wider than the current grid
  page (F0001-R016, unchanged by this PRD).
- Navigation must contain no destination this PRD's own screens do not
  implement — `Tenant Management`'s children stay hidden until both this
  PRD's screen and F0001-R024's authorization signal exist for them.

## 8. Lifecycle And State Transitions

Each screen's own lifecycle is the shell's existing loading/empty/error/
populated cycle (F0001-R021); this feature introduces no new session,
tenant, or authentication state transition beyond what F0001 already
defines.

| Current state | Trigger                                   | Next state | Required effect                                                                                         |
| ------------- | ----------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| Loading       | List request resolves, empty              | Empty      | Show an explicit empty state, no invented rows                                                          |
| Loading       | List request resolves, populated          | Populated  | Render the page; selection starts empty                                                                 |
| Loading       | List request fails                        | Error      | Show a retryable error; no stale or partial rows                                                        |
| Populated     | Create/Register succeeds                  | Loading    | Reload the current page so the new record's presence is server-confirmed, never optimistically inserted |
| Populated     | Retry/Disable/Deactivate/Restore succeeds | Loading    | Reload the current page for the same reason                                                             |
| Any           | Sort, filter, or page changes             | Loading    | Selection clears; pagination-adapter cache for stale pages is dropped                                   |

## 9. Data Requirements

This feature owns no server-side records. It reads and mutates existing
`admin.tenants`, `admin.cells`, `admin.cell_provisioning`, and
`admin.portal_users` rows exclusively through M0001-06/07/08's existing
domain functions, plus the two new list reads this PRD adds (F0002-R007,
R008), which use the same safe-view functions those modules already export.

This feature persists no new browser-local state. The pagination adapter's
per-page cursor cache is in-memory only, scoped to one mounted grid instance,
and never written to `localStorage` or `sessionStorage`.

## 10. API Requirements

### Existing Contracts

This feature consumes these contracts without redefining their requests,
responses, authorization, errors, or audit behavior:

| Purpose                     | Method and route                                        | Owning contract                                                                                                      |
| --------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Create a tenant             | `POST /api/admin-tenancy/v1/tenants`                    | [M0001-07](../modules/M0001-admin-tenancy/M0001-07-tenant-creation.md#10-api-requirements)                           |
| Register a cell             | `POST /api/admin-tenancy/v1/control/registry`           | [M0001-06](../modules/M0001-admin-tenancy/M0001-06-cell-management.md#10-api-requirements)                           |
| Retry or disable a cell     | `POST /api/admin-tenancy/v1/control/provision`          | [M0001-06](../modules/M0001-admin-tenancy/M0001-06-cell-management.md#10-api-requirements)                           |
| List cells and provisioning | `GET /api/admin-tenancy/v1/control/overview`            | [M0001-06](../modules/M0001-admin-tenancy/M0001-06-cell-management.md#10-api-requirements)                           |
| Create a portal user        | `POST /api/admin-tenancy/v1/accounts/users`             | [M0001-08](../modules/M0001-admin-tenancy/M0001-08-portal-user-and-membership-administration.md#10-api-requirements) |
| Deactivate a portal user    | `DELETE /api/admin-tenancy/v1/accounts/users/:id`       | [M0001-08](../modules/M0001-admin-tenancy/M0001-08-portal-user-and-membership-administration.md#10-api-requirements) |
| Restore a portal user       | `POST /api/admin-tenancy/v1/accounts/users/:id/restore` | [M0001-08](../modules/M0001-admin-tenancy/M0001-08-portal-user-and-membership-administration.md#10-api-requirements) |
| Startup context, nav gating | `GET /api/admin-tenancy/v1/access/context`              | [F0001-R022, F0001-R024](F0001-application-entry-and-shell.md#10-api-requirements)                                   |

All calls use the same-origin BFF contract and its versioned success and
error envelopes.

### New Contracts

`GET /api/admin-tenancy/v1/tenants`

| Field           | Required value                                                                                                  |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| Query           | `cursor` (opaque, optional), `limit` (1–100, default 50)                                                        |
| Capability      | `admin-tenancy::control::read`                                                                                  |
| Response `data` | `{ rows: [{id, code, name, tier, status, cellId, provisioned, rbacReady}], nextCursor }` (reusing `tenantView`) |
| Errors          | `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `400 INVALID_INPUT` (bad `limit`)                                       |
| Cache           | `Cache-Control: no-store`                                                                                       |

`GET /api/admin-tenancy/v1/accounts/users`

| Field           | Required value                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| Query           | `cursor` (opaque, optional), `limit` (1–100, default 50)                                              |
| Capability      | `admin-tenancy::accounts::read`                                                                       |
| Response `data` | `{ rows: [{id, email, status, mustChangePassword, deactivatedAt}], nextCursor }` (reusing `userView`) |
| Errors          | `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `400 INVALID_INPUT` (bad `limit`)                             |
| Cache           | `Cache-Control: no-store`                                                                             |

Both endpoints resolve `admin-tenancy::control::read`/`accounts::read`
exactly as `GET /control/overview` and the existing `accounts.js` routes
already do (`buildControlAuthority`/`accessScope` via `resolveAuthorization`),
and introduce no new error code.

## 11. Cross-Module Interactions

- M0001-06 owns cell data, provisioning state, and the register/retry/
  disable operations this feature's Cells screen calls.
- M0001-07 owns tenant data and creation; this feature adds the one list
  read M0001-07 does not yet expose, following M0001-06's existing
  pagination convention.
- M0001-08 owns portal-user data and its lifecycle; this feature adds the
  one list read M0001-08 does not yet expose.
- F0001 owns `GET /access/context` (extended by F0001-R024, not this PRD)
  and `StandardDataGrid` (consumed unchanged) and the Tenant Management nav
  group (F0001-R023) this feature's screens finally populate.
- M0003 will later differentiate authorization among non-root actors; this
  feature's capability checks are unaffected by that PRD's own scope and
  need no change when it ships.
- `W0001: Tenant Provisioning` and `W0002: Cell Provisioning` (roadmap-
  reserved, not yet written) own the cross-module creation-to-activation
  workflow; this feature's Create/Register actions are the same terminal
  API calls those workflows would also use, but this PRD defines no
  workflow sequencing between them.

## 12. Security And Audit

- Every action in this feature reuses an existing, already-audited
  operation; this PRD defines no new audit event, matching F0001-R022's
  precedent for the access-context read (a read here creates no event
  either).
- The two new list endpoints never return a password hash, role
  assignment, or raw capability list, matching the safe-view functions
  they reuse.
- `entryPoints.tenantManagement` (F0001-R024) reflects only capabilities
  the server has already resolved; this feature must not derive nav
  visibility from any other client-held state.
- Destructive actions (Disable, Deactivate) require confirmation and are
  otherwise subject to the same browser request protection every other
  state-changing call already uses.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                                              | Requirements |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| AC01      | The Tenants screen lists tenants with explicit loading, empty, and error states, and offers no update/suspend/archive/restore action.                                        | F0002-R001   |
| AC02      | Creating a tenant submits code, name, and tier with an idempotency key and surfaces the server's validation and conflict responses unmodified.                               | F0002-R002   |
| AC03      | The Cells screen lists cells with their latest provisioning operation, with explicit loading, empty, and error states.                                                       | F0002-R003   |
| AC04      | Register and Retry fire without confirmation; Disable requires confirmation before it fires.                                                                                 | F0002-R004   |
| AC05      | The Portal Users screen lists portal-user accounts with explicit loading, empty, and error states, and shows no membership data.                                             | F0002-R005   |
| AC06      | Create and Restore fire without confirmation; Deactivate requires confirmation before it fires.                                                                              | F0002-R006   |
| AC07      | `GET /tenants` returns a cursor-paginated, capability-gated, safe-view list matching `tenantView`, with `Cache-Control: no-store`.                                           | F0002-R007   |
| AC08      | `GET /accounts/users` returns a cursor-paginated, capability-gated, safe-view list matching `userView`, with `Cache-Control: no-store`.                                      | F0002-R008   |
| AC09      | Each screen's grid shows a disclosed row-count estimate, never an exact count the API cannot provide, and correctly re-fetches when sort, filter, or tenant context changes. | F0002-R009   |
| AC10      | Each of the three nav children appears only once both its screen is implemented and `entryPoints.tenantManagement` authorizes it; neither alone is sufficient.               | F0002-R010   |

## 14. Outstanding Questions

None.
