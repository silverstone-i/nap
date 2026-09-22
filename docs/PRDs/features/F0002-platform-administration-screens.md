# F0002: Platform Administration Screens

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Implemented                                                                                                                                                                                                                                                                                                                                                                                               |
| Type                 | Feature                                                                                                                                                                                                                                                                                                                                                                                                   |
| Related architecture | [BFF](../../architecture/bff.md)                                                                                                                                                                                                                                                                                                                                                                          |
| Related PRDs         | [F0001: Application Entry and Shell](F0001-application-entry-and-shell.md), [M0001-06: Cell Management](../modules/M0001-admin-tenancy/M0001-06-cell-management.md), [M0001-07: Tenant Creation](../modules/M0001-admin-tenancy/M0001-07-tenant-creation.md), [M0001-08: Portal-user and Membership Administration](../modules/M0001-admin-tenancy/M0001-08-portal-user-and-membership-administration.md) |
| Related decisions    | Reuse cursor pagination (the module's existing convention) for every new list endpoint, and bridge it to `StandardDataGrid` with a frontend adapter rather than changing the module's pagination style or the shared grid component                                                                                                                                                                       |
| Last reviewed        | 2026-09-22                                                                                                                                                                                                                                                                                                                                                                                                |

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
  error states. It must not show or manage tenant memberships. The list
  includes the root account, read-only, for operator visibility (2026-09-22
  amendment) — its row offers no Deactivate or Restore action, since
  M0001-08 refuses both against root regardless.
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
  `{rows: [userListView...], nextCursor}` in the existing versioned envelope
  with `Cache-Control: no-store` — `userListView` (`domain/accounts.js`) is
  `userView` plus one added field, `isRoot`, so the Portal Users screen can
  display the root account read-only (F0002-R006 amendment, 2026-09-22) —
  never a password hash or role assignment, and never a route through which
  root can be created, deactivated, or restored (M0001-08 already refuses
  all three against it).
- F0002-R009: Each screen's pagination must be handled by one shared
  frontend adapter translating `StandardDataGrid`'s page-index requests into
  sequential cursor fetches, caching each visited page's cursor, and
  invalidating that cache whenever sort, filter, or the tenant/resetKey
  context changes — mirroring `StandardDataGrid`'s own `requestSignature`
  invalidation. The adapter's `rowCount` must be an estimate (rows fetched
  so far, plus one page if the server reports more), passed to
  `StandardDataGrid`'s `rowCount` prop as-is; the grid renders MUI's default
  footer text (e.g. "1–25 of 42") against that estimate rather than an
  exact count the API does not provide — the estimate is not visually
  distinguished from an exact total.
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
| Populated     | Create/Register succeeds                  | Loading    | Reset to page 0 and reload so the new record's presence is server-confirmed, never optimistically inserted (accepted tradeoff: an operator on a later page is returned to page 0 rather than reloaded in place) |
| Populated     | Retry/Disable/Deactivate/Restore succeeds | Loading    | Reset to page 0 and reload for the same reason                                                           |
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
| AC09      | Each screen's grid computes a row-count estimate (rendered via MUI's default footer, not visually distinguished from an exact count) and correctly re-fetches when sort, filter, or tenant context changes. | F0002-R009   |
| AC10      | Each of the three nav children appears only once both its screen is implemented and `entryPoints.tenantManagement` authorizes it; neither alone is sufficient.               | F0002-R010   |

### Verification Evidence

Local validation on 2026-09-22: `npm run lint`, `npm run format:check`,
`npm test` (509 tests across the workspace — 402 API, 106 web, 1 shared),
`npm run build`, and `npm run licenses` passed. `git diff --check` reported
no whitespace errors.

`npm run test:db:local` passed all 165 tests against a disposable local
PostgreSQL 18 server, including new integration tests for `listTenants`
and `listUsers` (pagination and cursor-advance correctness, capability
denial, and — for users — an archived row surviving into the list, and
root appearing with `isRoot: true`).

API unit tests
([tenant-creation.test.js](../../../apps/api/tests/unit/tenant-creation.test.js),
[accounts.test.js](../../../apps/api/tests/unit/accounts.test.js)) cover:
`GET /tenants` and `GET /accounts/users` returning the safe `tenantView`/
`userListView` shape with `Cache-Control: no-store` (AC07, AC08); session
and capability gating (`401`/`403`); an out-of-range `limit` reporting
`400 INVALID_INPUT`; cursor/limit pagination advancing correctly; an
archived portal user still appearing in the list (needed for F0002-R006's
Restore action, since `admin.portal_users` is soft-delete tracked and
would otherwise exclude it); and root appearing in the list with
`isRoot: true`, distinct from every ordinary account's `isRoot: false`
(F0002-R005/R008 amendment, 2026-09-22 — see below).

Web unit tests
([apps/web/tests](../../../apps/web/tests)) cover: the cursor-to-page
adapter (`cursorPageAdapter.test.js`) — sequential paging via cached
cursors, the `page === 0` cache-reset rule, a `pageSize` change resetting
the cache, the disclosed `rowCount` estimate for both a mid-list and a
final page, and `mapRow` application; and all three screens
(`tests/pages/`) — loading/empty/error states (F0001-R021); Tenants'
absence of any row action (AC01) and Create tenant's idempotency-key
submission and unmodified server-error surfacing (AC02); Cells'
conditional Retry/Disable visibility and Disable's required confirmation
(AC04); and Portal Users' mutually-exclusive Deactivate/Restore actions,
Deactivate's required confirmation, and the absence of membership data
(AC05, AC06). `tenantManagementNav.test.js` was updated to prove all three
children now render together when implemented and authorized, and that
partial authorization shows only the authorized subset (F0002-R010).

A manual pass in a local browser against `npm run dev:api` / `npm run
dev:web` (an already-provisioned local PostgreSQL 18 admin database),
logged in as the bootstrapped root account, exercised every acceptance
criterion end to end: `Tenant Management` now renders all three children;
creating a tenant (`ACME`) surfaced it in the list on reload; creating a
second tenant while already populated confirmed the list, not an
optimistic insert, drives the UI; registering a cell (`dev` /
`nap_dev_cell_testcell`) showed it `registered`/`queued`, disabled, 0
attempts, with no row action available (Retry is hidden outside `failed`,
Disable is hidden while disabled — F0002-R004's own state, not an
invented rule); creating a portal user, Deactivating it (confirmation
required, per AC06), and Restoring it (no confirmation) all round-tripped
correctly, including the status/`deactivatedAt` transitions M0001-08
defines (`active` → `disabled` with a `deactivatedAt` timestamp on
Deactivate, back to `disabled` with `deactivatedAt` cleared on Restore).

That manual pass, prompted by screenshot feedback on the header's visual
layout, surfaced two defects in F0001's shared shell code — neither
previously observable, since F0002 is the first feature to give any page a
dynamic contextual-header action:

- `ContextualActionHeader.jsx`'s `Stack` passed `alignItems`/
  `justifyContent` as direct component props; in the MUI version this repo
  now runs, only `direction` maps through Stack's own dedicated style
  function — `alignItems`/`justifyContent` were silently dropped, so every
  page's action button rendered immediately after the title instead of at
  the header's trailing edge. Fixed by moving both into the `sx` prop,
  where MUI's `sx` system reliably applies them. Verified live: the
  "Create tenant"/"Register cell"/"Create portal user" buttons now sit at
  the header's right edge.
- `PageHeaderContext.jsx` bundled a stable `useState` setter together with
  the changing `header` value into one `useMemo`'d context object. Any
  `usePageHeader` caller is itself a consumer of that same context (to
  reach the setter), so every `setHeader` call re-rendered the caller too
  — harmless while `actions` was always `null`/absent (every pre-F0002
  page), but once a page passes a non-memoized `actions` node (this
  feature's header buttons, the first anywhere in the app), each
  re-render recreated `actions`, changing `usePageHeader`'s effect
  dependency, calling `setHeader` again, forever — a `Maximum update depth
exceeded` crash loop on every one of this feature's three screens. Fixed
  by splitting into two contexts: `PageHeaderContext` (the `header` value,
  for `usePageHeaderValue`) and `SetPageHeaderContext` (the stable setter
  alone, for `usePageHeader`), so registering an action no longer forces
  the registering page to re-render. Verified live with an injected
  `console.error` counter showing zero errors across repeated navigation
  between all three new screens, and functionally by exercising every
  create/register/deactivate/restore flow without incident.

Also addressed, per the same screenshot feedback: the contextual header's
page-title (`h1`) font size was reduced 25% (28px → 21px,
`apps/web/src/theme/theme.js`), and each screen's header action button now
uses `size="small"` with a new `MuiButton` `sizeSmall` style override
(10.5px, 25% smaller than the base 14px button token) — both theme-level
changes, so they apply to every page's contextual header, not only this
feature's three screens.

**2026-09-22, same-day follow-up — two amendments from manual use:**

- Register cell's error and helper text said "lowercase letters, digits,
  and hyphens" without mentioning that M0001-06's suffix rule also required
  starting with a letter, so a `1` suffix was rejected with a message that
  didn't explain why. Traced to the actual rule, then relaxed rather than
  just re-worded: M0001-06 §7 no longer requires the suffix's first
  character to be a letter, so `nap_dev_cell_1` is now a legitimate
  database name (`parseSuffix`, `domain/cells.js`; see M0001-06's own
  Verification Evidence for the full amendment note). `RegisterCellDialog`'s
  copy was updated to match, and verified live by registering `nap_dev_cell_1`.
- The Portal Users screen excluded root entirely, matching M0001-08's
  "Root-user changes" exclusion — but that PRD line is about _changes_, not
  _visibility_, and an operator reasonably expects to see the root account
  exists. Amended F0002-R005/R008: `GET /accounts/users` now includes root,
  via a new list-only projection, `userListView` (`userView` plus
  `isRoot`) — `userView` itself, and every other route that calls it
  (`POST /accounts/users`, `PATCH`, `DELETE`, `.../restore`), is unchanged,
  so root stays exactly as unreachable through every write path as before
  (`createOrReuseUser`/`archiveUser`/`restoreUser` all still refuse it).
  `PortalUsersPage`'s `rowActions` returns no actions for `isRoot: true`,
  since Deactivate/Restore would just fail against it server-side anyway.
  Verified live: `root@napsoft.io` now appears in the list with no row
  action, alongside an ordinary account that still has one.

`npm test` (509 tests) and `npm run test:db:local` (165 tests) both still
pass in full after these two amendments.

## 14. Outstanding Questions

None.
