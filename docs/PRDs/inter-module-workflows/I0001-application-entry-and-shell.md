# I0001: Application Entry and Shell

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Implemented                                                                                                                                                                                                                                                                                                                                                                                                |
| Type                 | Inter-module workflow                                                                                                                                                                                                                                                                                                                                                                                      |
| Related architecture | [BFF](../../architecture/bff.md)                                                                                                                                                                                                                                                                                                                                                                           |
| Related PRDs         | [M0001-03: Authentication](../modules/M0001-admin-tenancy/M0001-03-authentication.md), [M0001-04: Session Management](../modules/M0001-admin-tenancy/M0001-04-session-management.md), [M0001-05: Authorization](../modules/M0001-admin-tenancy/M0001-05-authorization.md), [M0001-09: Tenant Selection And Support Access](../modules/M0001-admin-tenancy/M0001-09-tenant-selection-and-support-access.md) |
| Related decisions    | One application shell for tenant work and management (2026-09-25)                                                                                                                                                                                                                                                                                                                                          |
| Last reviewed        | 2026-09-25                                                                                                                                                                                                                                                                                                                                                                                                 |

## 2. Purpose

Provide one browser flow from the signed-out state to an authorized platform or
tenant application shell. The feature gives portal users a consistent way to
authenticate, restore or end a session, select a tenant, navigate the
application, and control browser-local display preferences.

## 3. Scope

### Included

- Login, authentication errors, throttling, and required or voluntary password
  change.
- Session restoration, logout, expiry, protected routes, safe return routing,
  tenant selection, and tenant switching.
- Minimal platform and tenant Home work areas.
- Responsive application layout, navigation, contextual actions, display-mode
  selection, and the initial user profile menu.
- Shared behavior for ordinary data grids and space for future
  spreadsheet-style editors.
- A browser-focused access-context endpoint that combines the existing session
  and entry information needed to start the application.

### Excluded

- Tenant, cell, portal-user, membership, role, and entitlement administration
  screens.
- The authorization decision model and server-side capability enforcement.
- Tenant-logo and profile-image storage or delivery.
- Server-synchronized user preferences.
- Spreadsheet package selection and budgeting or estimating behavior.
- Password recovery and account self-registration.

## 4. Actors And Permissions

The server remains authoritative. Browser route protection and destination
visibility improve the user experience but do not grant access.

| Context             | Actor                               | Required permission or state                                          | Result                                                                                  |
| ------------------- | ----------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `/login`            | Anonymous portal user               | None                                                                  | May submit credentials and receive a success, generic rejection, or throttling response |
| `/password`         | Restricted portal user              | Valid session with password change required                           | May change the password or log out; every other protected destination is denied         |
| `/password`         | Authenticated portal user           | Valid unrestricted session                                            | May voluntarily change the password                                                     |
| `/tenants`          | Authenticated portal user           | At least one eligible tenant                                          | May view eligible tenants and select one                                                |
| `/home`             | Authenticated portal user           | A selected eligible tenant, or `entryPoints.platform` is true         | May enter the application shell                                                         |
| `/management/*`     | Authenticated portal user           | `entryPoints.platform` is true and the server authorizes each request | May use implemented authorized management destinations in the application shell         |
| Any protected route | Anonymous user or invalid session   | None                                                                  | Return to `/login`; preserve only a safe same-origin return path                        |
| Any destination     | Authenticated but unauthorized user | Required server authorization is absent                               | Keep the destination out of navigation and honor the server's denial                    |

## 5. Concepts And Terminology

| Term                     | Meaning                                                                                                                          |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Access context           | The safe session, portal-user identity, selected tenant, and available application entry points returned for application startup |
| Application shell        | The one application frame for every signed-in destination; it serves the selected tenant and management alike                    |
| Tenant context           | The selected tenant held in the server session; it never comes from the URL                                                      |
| Contextual action header | The row above the work area where the active destination supplies its title and actions                                          |
| Standard grid            | An ordinary list or table rendered with MUI X Community and server-side paging                                                   |
| Spreadsheet-style editor | A future work area for dense, cell-oriented editing; its package and domain rules belong to the feature that uses it             |
| Display mode             | The browser-local Dark, Light, or System appearance preference                                                                   |

## 6. Functional Requirements

- I0001-R001: `/login` must submit credentials through the existing login API,
  show the same generic message for every rejected credential case, and show a
  throttling message that respects the server's retry information.
- I0001-R002: A login that requires password replacement must go to `/password`
  and must not expose any other protected destination until replacement
  succeeds. An unrestricted user must also be able to open `/password`
  voluntarily.
- I0001-R003: Application startup and protected-route entry must load the access
  context. After login, or after a required password change, a user with no
  selected tenant and exactly one eligible tenant must have that tenant
  selected through the tenant selection API; if selection fails, the user stays
  unselected. A user with a valid selected tenant or with platform entry must
  restore into `/home`. A user with neither, but with eligible tenants, must see
  `/tenants`.
- I0001-R004: The browser routes must be `/login`, `/password`, `/tenants`,
  `/home`, and the `/management/*` destinations. A protected route must not
  render its content until its session and entry requirements have been
  resolved.
- I0001-R005: Session expiry must immediately remove protected content, clear
  client-held session state, and return to `/login` with a session-expired
  message. The browser may retain the requested path only when it is a safe
  same-origin application path and must authorize it again before returning.
- I0001-R006: Logout must call the existing logout API, clear client-held session
  state even if the session has already expired, and return to `/login`.
- I0001-R007: `/tenants` and the tenant control must list only eligible tenants
  returned by the server. Selecting another tenant must use the existing tenant
  selection API, accept its rotated session, clear tenant-specific UI state,
  and return to `/home`. `/tenants` must stay reachable while a tenant is
  selected, so the tenant control can switch tenants.
- I0001-R008: An unavailable or newly ineligible tenant must leave the prior
  session context unchanged and show an actionable error without rendering that
  tenant's protected content.
- I0001-R009: The shell must contain a top header spanning the full width
  above a left navigation area, a contextual action header, and a work area.
  Left to right, the top header must contain: the hamburger control at the
  leading (top-left) edge; the tenant control immediately to its right;
  and, at the trailing (right) edge, user initials derived from the
  authenticated email address. The tenant control shows a tenant name only —
  no tenant logo, which must wait for a later server contract, same as the
  profile menu's tenant-logo and profile-image presentation (R011). The
  hamburger control is present at every width, with a different effect per
  breakpoint: on a phone it opens and closes navigation as a modal surface
  (icons and labels); at tablet and desktop widths it toggles the in-flow
  navigation rail between expanded (icons and labels) and collapsed (icons
  only, with a tooltip identifying each icon and the active item still
  highlighted) — navigation is never fully hidden at those widths. The
  tenant control must show the selected tenant's name, or `Select tenant` when
  none is selected, and open tenant selection when the user has eligible
  tenants. A user with no eligible tenants sees the platform operator's own
  company name instead.
- I0001-R010: Navigation must have no more than two levels and must not use
  breadcrumbs. The NAP `nap.` wordmark must appear at the bottom of the
  navigation area.
- I0001-R011: The profile menu must contain Change password, Logout, and a
  Settings submenu with Dark, Light, and System display modes. Tenant-logo and
  profile-image presentation must wait for later server contracts.
- I0001-R012: Display mode and standard-grid page size must persist in browser
  storage. System mode must follow operating-system appearance changes while it
  remains selected.
- I0001-R013: At phone widths, navigation must open as a modal surface, controls
  must remain keyboard and touch operable, and work areas must reflow without
  hiding required actions. Tablet and desktop layouts must use the available
  width without imposing phone behavior.
- I0001-R014: The application shell must provide one minimal Home work area
  that names the selected tenant, or states that none is selected, with no
  invented metrics. Navigation must
  show only implemented destinations confirmed by the server.
- I0001-R015: Ordinary data grids must use MUI X Community with server-side
  pagination, 25 rows by default, and page-size choices of 25, 50, and 100. One
  browser-local page-size preference must apply across standard grids.
- I0001-R016: A standard grid must provide a leading checkbox column,
  current-page-only bulk selection, and a trailing row-action menu. Selection
  must clear when the page, filter, sort, or tenant context changes, and
  destructive lifecycle actions must require confirmation.
- I0001-R017: Standard grids on phones must keep essential columns visible, hide
  lower-priority columns responsively, and permit horizontal scrolling when the
  remaining content is wider than the work area.
- I0001-R018: The shell must support future spreadsheet-style work areas with
  keyboard navigation, copy and paste, bulk cell editing, validation feedback,
  and large datasets without choosing a spreadsheet package or defining domain
  behavior in this PRD.
- I0001-R019: The feature must apply the tokens, Inter and JetBrains Mono usage,
  accessibility rules, contrast requirements, and wordmark treatment defined
  by [BRAND.md](../../branding/BRAND.md).
- I0001-R020: Interactive controls must have accessible names, visible focus,
  logical keyboard order, and predictable focus movement when menus, modal
  navigation, confirmation dialogs, or route transitions open and close.
- I0001-R021: Authentication, restoration, tenant selection, and work areas must
  provide explicit loading, empty, and error states without showing stale
  protected data.
- I0001-R022: `GET /api/admin-tenancy/v1/access/context` must return the existing
  safe session view, `{ id, email }` for the portal user, the selected tenant's
  `{ id, code, name, tier }` or `null`, the platform operator's own company in
  the same shape (a fixed record, independent of the caller's own tenant
  context), and the server-resolved platform and tenant entry flags. It must
  use the existing versioned envelope, set `Cache-Control: no-store`, return
  `401 UNAUTHENTICATED` for an invalid session, and exclude credentials,
  password data, role assignments, and raw capability lists.
- I0001-R023: The application shell must provide a two-level `Tenant Management`
  navigation group, whether or not a tenant is selected, with `Tenants`, `Cells`, and `Portal Users` as its child
  destinations. In the phone drawer and expanded navigation rail, the group
  and each visible child must show an icon and label, and the children must be
  visually nested under the group. In the collapsed rail, the group icon must
  remain visible with a tooltip and must open an accessible flyout containing
  the visible child icons and labels. The group must be hidden when none of its
  children is implemented and server-authorized; an unavailable child must not
  appear as a placeholder.
- I0001-R024: `GET /api/admin-tenancy/v1/access/context` must return an
  `entryPoints.tenantManagement` object with `tenants`, `cells`, and
  `portalUsers` boolean fields, each derived from the caller's actual
  resolved capabilities (`admin-tenancy::control::read` for `tenants` and
  `cells`; `admin-tenancy::accounts::read` for `portalUsers`) and never from
  `entryPoints.platform` or any other coarser stand-in. This is the
  per-destination signal I0001-R023's `Tenant Management` group needs to
  gate its children individually; it must not expose a raw capability list.

## 7. Business Rules And Invariants

- Server session resolution and request authorization are the source of truth.
  Browser state must not grant platform, tenant, route, or action access.
- A selected tenant ID in browser storage or a URL must not select a tenant or
  cell. Tenant context changes only through the server-owned session contract.
- Tenant-specific content renders only for the selected tenant returned by the
  access context. The shell remounts when that selection changes.
- A return path must be a normalized application path on the current origin. It
  must not contain credentials and must not accept a scheme, host, protocol-
  relative path, or non-application destination.
- Protected content must be removed before an expired, invalid, or unauthorized
  state is shown.
- Navigation must contain no placeholder or unavailable destination.
- Bulk selection applies only to the current grid page and never carries across
  a page, filter, sort, or tenant change.
- Browser-local display and page-size preferences may survive logout because
  they contain no account, tenant, or session data.

## 8. Lifecycle And State Transitions

| Current state           | Trigger                                   | Next state                           | Required effect or failure behavior                                   |
| ----------------------- | ----------------------------------------- | ------------------------------------ | --------------------------------------------------------------------- |
| Signed out              | Valid login                               | Restoring                            | Load access context; route after server state is known                |
| Signed out              | Rejected login                            | Signed out                           | Show the generic authentication error                                 |
| Signed out              | Throttled login                           | Signed out                           | Show throttling and retry information                                 |
| Restoring               | Password change required                  | Restricted                           | Route to `/password`                                                  |
| Restoring               | Valid selected tenant, or platform entry  | Application shell                    | Route to `/home`                                                      |
| Restoring               | Eligible tenants only, no valid selection | Tenant selection                     | Route to `/tenants`                                                   |
| Restricted              | Successful password change                | Restoring                            | Reload access context using the rotated session                       |
| Tenant selection        | Successful selection                      | Application shell                    | Clear prior tenant UI state and route to `/home`                      |
| Application shell       | Successful tenant switch                  | Application shell                    | Clear old tenant UI state and route to `/home`                        |
| Any authenticated state | Logout                                    | Signed out                           | Clear protected state and route to `/login`                           |
| Any authenticated state | Session expires or becomes invalid        | Signed out                           | Clear protected state, route to `/login`, and show the expiry message |
| Any protected state     | Server denies destination or action       | Protected error or safe parent route | Do not render or retain denied content                                |

## 9. Data Requirements

This PRD owns no server-side records. It reads the existing session,
portal-user, tenant-access, and authorization state through the API.

This PRD may persist only:

- the selected display mode: `dark`, `light`, or `system`;
- one standard-grid page-size preference: `25`, `50`, or `100`; and
- a temporary safe return path when routing requires authentication.

Browser storage must not contain session credentials, passwords, role
assignments, raw capabilities, or copied access-context responses. The session
credential remains in the server-issued `HttpOnly` cookie.

## 10. API Requirements

### Existing Contracts

This PRD consumes these contracts without redefining their requests,
responses, authorization, errors, rotation, or audit behavior:

| Purpose               | Method and route                            | Owning contract                                                                                                |
| --------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Login                 | `POST /api/admin-tenancy/v1/auth/login`     | [M0001-03](../modules/M0001-admin-tenancy/M0001-03-authentication.md#10-api-requirements)                      |
| Change password       | `POST /api/admin-tenancy/v1/auth/password`  | [M0001-03](../modules/M0001-admin-tenancy/M0001-03-authentication.md#10-api-requirements)                      |
| Read current session  | `GET /api/admin-tenancy/v1/session/current` | [M0001-04](../modules/M0001-admin-tenancy/M0001-04-session-management.md#10-api-requirements)                  |
| Rotate session        | `POST /api/admin-tenancy/v1/session/rotate` | [M0001-04](../modules/M0001-admin-tenancy/M0001-04-session-management.md#10-api-requirements)                  |
| Logout                | `POST /api/admin-tenancy/v1/auth/logout`    | [M0001-04](../modules/M0001-admin-tenancy/M0001-04-session-management.md#10-api-requirements)                  |
| List eligible tenants | `GET /api/admin-tenancy/v1/access/tenants`  | [M0001-09](../modules/M0001-admin-tenancy/M0001-09-tenant-selection-and-support-access.md#10-api-requirements) |
| Select tenant         | `POST /api/admin-tenancy/v1/access/select`  | [M0001-09](../modules/M0001-admin-tenancy/M0001-09-tenant-selection-and-support-access.md#10-api-requirements) |

All calls use the same-origin BFF contract and its versioned success and error
envelopes.

### Access Context Contract

`GET /api/admin-tenancy/v1/access/context` must return the browser's startup
context in the existing versioned success envelope and with
`Cache-Control: no-store`.

| Response field                             | Required value                                                                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `session`                                  | The existing safe session view from M0001-04                                                                                                     |
| `user`                                     | `{ id, email }` for the authenticated portal user                                                                                                |
| `selectedTenant`                           | `{ id, code, name, tier }` for the selected eligible tenant, or `null`                                                                           |
| `operator`                                 | `{ id, code, name, tier }` for the platform operator's own tenant record — a fixed, single record independent of the caller's own tenant context |
| `entryPoints.platform`                     | `true` only when resolved server authorization permits platform entry                                                                            |
| `entryPoints.tenant`                       | `true` when at least one eligible tenant is available                                                                                            |
| `entryPoints.tenantManagement.tenants`     | `true` when the caller's resolved capabilities include `admin-tenancy::control::read` (I0001-R024)                                               |
| `entryPoints.tenantManagement.cells`       | `true` when the caller's resolved capabilities include `admin-tenancy::control::read` (I0001-R024)                                               |
| `entryPoints.tenantManagement.portalUsers` | `true` when the caller's resolved capabilities include `admin-tenancy::accounts::read` (I0001-R024)                                              |

The endpoint must resolve all fields for one authenticated request. It must not
return a session credential, password data, role assignment, or raw capability
list. An invalid session must return `401 UNAUTHENTICATED`. Other failures must
use the existing versioned error envelope. This read does not change tenant
selection and does not replace server authorization on later requests.

## 11. Cross-Module Interactions

- M0001-03 authenticates credentials, enforces throttling, and changes
  passwords.
- M0001-04 owns session creation, resolution, rotation, expiry, and revocation.
- M0001-05 supplies resolved authorization for platform entry and every
  protected API operation.
- M0001-09 lists eligible tenants and changes the selected tenant in the
  server-owned session.
- The BFF owns the cookie, same-origin browser request protection, API
  envelopes, and server-selected database routing.
- Later feature and module PRDs supply authorized navigation destinations,
  contextual actions, ordinary grids, and spreadsheet-style work areas.

If any required context cannot be resolved safely, the feature must fail
closed and must not reuse a prior user's, tenant's, or route's protected data.

## 12. Security And Audit

- The browser must send the server-owned session cookie using the BFF contract
  and must not read, copy, or persist its credential.
- Client-side routing, hidden controls, and navigation filtering must never be
  treated as authorization.
- State-changing requests must use the existing browser request protection.
- Login, password change, session rotation, logout, tenant selection, and
  authorization keep the audit behavior defined by their owning PRDs. The new
  access-context read creates no new audit event.
- Authentication errors must not reveal whether an account exists or why it is
  ineligible.
- Session expiry, tenant changes, and authorization failures must remove stale
  protected content before showing the next state.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Requirements                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| AC01      | Valid credentials enter restoration; invalid credentials receive one generic rejection; a throttled attempt shows retry information without entering the application.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | I0001-R001, I0001-R003, I0001-R021 |
| AC02      | A required password change permits only `/password` and logout until it succeeds; an unrestricted user can voluntarily change the password.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | I0001-R002, I0001-R004             |
| AC03      | Restoration enters `/home` when a tenant selection remains valid or platform entry is available, otherwise tenant selection when eligible tenants exist. Protected content does not render during restoration.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | I0001-R003, I0001-R004, I0001-R021 |
| AC04      | Tenant selection and switching show only eligible tenants, accept the rotated session, clear tenant-specific UI state, and route to the selected tenant. An unavailable or ineligible tenant shows an error and does not expose its content.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | I0001-R007, I0001-R008             |
| AC05      | Logout clears protected state and returns to `/login`. Expiry also shows a session-expired message and preserves only a safe same-origin return path that is reauthorized before use.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | I0001-R005, I0001-R006             |
| AC06      | The one Home work area names the selected tenant, or states that none is selected, without invented metrics; Tenant Management stays available with or without a selected tenant. Unimplemented or unauthorized destinations stay hidden, and direct browser or API access remains server-denied.                                                                                                                                                                                                                                                                                                                                                                                                                                                          | I0001-R014                         |
| AC07      | At phone, tablet, and desktop widths, the header, navigation, contextual action header, and work area remain usable. The top header spans the full width, with the hamburger at the leading edge, the tenant control immediately to its right (tenant name only, no logo), and user initials at the trailing edge. The hamburger is present at every width with a per-breakpoint effect — a modal drawer (icons and labels) on phone, an expanded/collapsed toggle for the in-flow rail at tablet and desktop, with tooltips identifying collapsed icons and the active item always highlighted; the header shows the operator's own company name in platform context and the selected tenant's name in tenant context. Required actions remain available. | I0001-R009, I0001-R010, I0001-R013 |
| AC08      | The profile menu exposes Change password, Logout, and Settings for Dark, Light, or System. Display mode persists, and System reacts to an operating-system mode change without a reload.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | I0001-R011, I0001-R012             |
| AC09      | A standard grid requests server pages, defaults to 25 rows, offers 25, 50, and 100, and applies a changed page size to other standard grids in the same browser.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | I0001-R015                         |
| AC10      | Grid checkboxes select only the current page; page, filter, sort, and tenant changes clear selection; bulk and row actions work; destructive lifecycle actions require confirmation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | I0001-R016                         |
| AC11      | A phone-sized grid retains essential columns, hides lower-priority columns, and scrolls horizontally when needed without losing selection or row actions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | I0001-R017                         |
| AC12      | A representative spreadsheet-style work area fits in the shell and can provide keyboard navigation, copy and paste, bulk cell editing, validation feedback, and a large dataset without a shell redesign.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | I0001-R018                         |
| AC13      | Login, menus, modal navigation, dialogs, tenant selection, grids, and route changes are operable by keyboard; controls have accessible names; focus remains visible and moves predictably.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | I0001-R020                         |
| AC14      | Light and dark presentations use BRAND.md tokens, typography, contrast, status, focus, and `nap.` wordmark rules.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | I0001-R019                         |
| AC15      | The access-context endpoint returns the safe session, `{ id, email }` user, nullable safe selected tenant, the platform operator's own tenant record, and correct platform and tenant entry flags in the versioned envelope with `Cache-Control: no-store`; an invalid session returns `401`, and no forbidden security data is exposed.                                                                                                                                                                                                                                                                                                                                                                                                                   | I0001-R003, I0001-R014, I0001-R022 |
| AC16      | Platform navigation presents `Tenant Management` as a two-level group. The expanded rail and phone drawer show icons and labels with visible children nested under the group; the collapsed rail keeps the group icon visible with a tooltip and opens a keyboard-accessible child flyout. `Tenants`, `Cells`, and `Portal Users` appear only when their destinations are implemented and server-authorized, and the empty group remains hidden.                                                                                                                                                                                                                                                                                                           | I0001-R010, I0001-R014, I0001-R023 |
| AC17      | The access-context endpoint returns `entryPoints.tenantManagement.{tenants, cells, portalUsers}`, each derived from the caller's actual resolved capabilities and never from `entryPoints.platform` or a raw capability list.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | I0001-R024                         |

## Verification Evidence

This section verifies I0001-R001 through I0001-R024 and AC01 through AC17.

Local validation on 2026-09-22: `npm run lint`, `npm run format:check`,
`npm test` (492 unit tests across the workspace — 25 toolchain, 391 API,
75 web, 1 shared — including 9 API tests for the access-context endpoint
and 75 web tests for this PRD, of which 24 cover I0001-R023/AC16's
`Tenant Management` navigation group and 4 more cover I0001-R024/AC17's
`entryPoints.tenantManagement` gating logic), `npm run build`, and
`npm run licenses` passed. `git diff --check` reported no whitespace
errors.

`npm run test:db` passed all 158 tests against a disposable local
PostgreSQL 18 server (`scripts/test-db-local.mjs`); this PRD added no
new integration tests since R024, like R022 before it, is an additive read
on top of already-integration-tested session and authorization domain
logic.

API unit tests
([access-context.test.js](../../../apps/api/tests/unit/access-context.test.js))
cover: `401` for no session; `403 PASSWORD_CHANGE_REQUIRED` for a restricted
session, matching `GET /session/current`'s convention; `entryPoints` both
false for a plain user with no tenant; `entryPoints.tenant` true and the
selected tenant's safe view returned once a tenant is selected;
`entryPoints.platform` true for root; the platform operator's own tenant
record returned as `operator` regardless of the caller's own tenant
context; `entryPoints.tenantManagement` all `true` for root and all
`false` for a plain user, proving it is derived from actual resolved
capabilities rather than copying `entryPoints.platform` (I0001-R024,
AC17); and a serialized-response scan confirming no token, password, or
role field ever appears (AC15).

Web unit tests
([apps/web/tests](../../../apps/web/tests)) cover: `deriveDestination`
against every row of the §8 lifecycle table; the safe-return-path pattern
and its re-authorization against a fresh access context, including
rejection of a scheme, a protocol-relative path, and a `..` segment;
initials derived from an email local-part; the login form's one generic
rejection message and throttle countdown, and its redirect to the resolved
destination on success (AC01, AC03); the tenant list's loading, empty, and
error states, and selecting a tenant (AC04); display-mode persistence and
live reaction to a simulated OS appearance change (AC08); and the standard
grid's shared page-size default and its selection clearing when the tenant
context changes (AC09, AC10).

A manual pass in a local browser against `npm run dev:api` / `npm run
dev:web` (a disposable local PostgreSQL 18 admin database, migrated and
bootstrapped) exercised: login with the bootstrapped root account,
restoration into `/management` (root has no eligible tenant in this
environment since its own tenant is not yet provisioned — AC03); the
profile menu's Change password, Settings submenu, and Logout; switching
Light/Dark/System from the Settings submenu with an immediate visual
change and persistence across a reload (AC08); logout clearing state and
returning to `/login` (AC05); and the phone-width modal navigation drawer
opening over a scrim with the hamburger control and closing on navigation
(AC07, R013). Session-expiry-while-authenticated (R005) and multi-tenant
switching (AC04) were exercised through the automated tests above rather
than manually, since the local environment's only account has no eligible
tenant yet.

That manual pass surfaced three shell-layout defects, fixed the same day:
the top header did not span the full width above the navigation area; the
hamburger control only rendered at phone widths instead of at every width
(R009); and the desktop navigation rail's open/closed state was captured
once at mount and never resynchronized, so it could get stuck collapsed
after the viewport crossed the phone/desktop breakpoint. The header/nav
layout was restructured to the standard full-width-header-above-a-row
pattern (`AppShell.jsx`, `TopHeader.jsx`, `NavDrawer.jsx` — a `persistent`
rather than `permanent` drawer at tablet/desktop, so the hamburger can
collapse it in place), and the nav's open state now re-derives whenever the
phone/desktop boundary is crossed, not only at mount. Also added per this
feedback: the `operator` field (I0001-R022) so the header can show the
platform operator's own company name in platform context, matching R009's
requirement that the tenant control always show something meaningful.
Re-verified manually after the fix at phone and desktop widths, including
toggling the desktop rail and resizing across the breakpoint without a
reload.

A further refinement, same day: the tablet/desktop hamburger no longer
hides navigation entirely — it toggles the in-flow rail between expanded
(icons and labels) and collapsed (icons only, `NAV_RAIL_WIDTH` in
`NavDrawer.jsx`), with a tooltip identifying each icon when collapsed and
the active item's gold indicator remaining visible in both states.
Navigation is now never fully hidden at those widths, only narrowed. This
also simplified `AppShell.jsx`: expanded/collapsed state at tablet/desktop
and open/closed state on phone are now two independent, breakpoint-scoped
pieces of state rather than one shared "open" flag, which removes the
earlier breakpoint-crossing resynchronization case entirely (there is
nothing to resynchronize — the rail is always rendered outside of phone
width). Re-verified manually: rail expand/collapse and its tooltip on
desktop, and the phone modal drawer (icons and labels) unaffected by the
change.

Scope note carried over from the PRD's acceptance criteria: `StandardDataGrid`
([apps/web/src/grid/StandardDataGrid.jsx](../../../apps/web/src/grid/StandardDataGrid.jsx))
and `SpreadsheetPlaceholder`
([apps/web/src/spreadsheet/SpreadsheetPlaceholder.jsx](../../../apps/web/src/spreadsheet/SpreadsheetPlaceholder.jsx))
satisfy AC09–AC12 as fully implemented, independently tested reusable
components. They are not wired into navigation, since I0001 excludes
entity-administration screens — the first real consumers of a
server-paginated list — and inventing a destination to display them would
violate §7's "no placeholder or unavailable destination" rule and R014's
"no invented metrics." Later inter-module workflow PRDs that add real list screens
consume `StandardDataGrid` directly.

### I0001-R023 / AC16 — Tenant Management navigation group

Added a generic, reusable two-level nav group
([NavGroup.jsx](../../../apps/web/src/shell/NavGroup.jsx)) and wired a
`Tenant Management` group into the platform shell's navigation
([NavDrawer.jsx](../../../apps/web/src/shell/NavDrawer.jsx)), gated to the
platform area only (`AppShell` now takes an `area: 'platform'|'tenant'`
prop). In the phone drawer and the expanded rail it is an accordion: the
group header (icon, label, chevron) toggles a nested, indented list of
visible children with their own icons and labels, removed from the tab
order while collapsed (`Collapse ... unmountOnExit`). In the collapsed
rail it is a single icon button with a tooltip, opening an MUI `Menu`
flyout on click, tap, or Enter/Space — which supplies its own arrow-key
navigation between children, Escape-to-close, and focus return to the
trigger. The active-nav gold indicator (BRAND.md) highlights the active
child in both layouts, and the group's own icon in the collapsed rail when
any child is active.

Before wiring real children, the actual authorization question was
checked against the running system rather than assumed:
[`resolveAuthorization`](../../../apps/api/src/modules/admin-tenancy/domain/authorization.js)
already resolves a granular `platformCapabilities` list server-side
(`admin-tenancy::control::*` for cells,
`admin-tenancy::accounts::*` for portal users, etc., in
[`systemRoles.js`](../../../apps/api/src/capability/systemRoles.js)), but
I0001-R022 deliberately excludes that raw capability list from
`GET /access/context`, which exposes only the coarse `entryPoints.platform`
boolean. There is therefore no per-destination signal the browser could use
to authorize `Tenants`, `Cells`, and `Portal Users` independently of one
another — and no `Tenants`/`Cells`/`Portal Users` screen exists yet either,
since I0001 §3 Scope excludes entity-administration screens. Per this
requirement's own instruction not to invent browser-side authorization,
[`tenantManagementNav.js`](../../../apps/web/src/shell/tenantManagementNav.js)
records all three children as `implemented: false` and documents both gaps
in its file comment; `visibleTenantManagementChildren` therefore returns no
children today, which is what correctly keeps the whole group hidden — the
empty-group case AC16 requires — rather than a group rendered with
everything filtered out. **Missing contract, flagged for a follow-up PRD or
API change:** `GET /access/context` needs a per-destination authorization
signal (for example `entryPoints.tenantManagement: { tenants, cells,
portalUsers }`) before any child here can move to `implemented: true`; until
then, `entryPoints.platform` must not be used as a stand-in, since a
non-root platform operator with only some of those capabilities (once
I0005 ships non-root roles) must not see a destination it cannot use.

Verified with 24 new web tests: `NavGroup.test.jsx` (10 tests) covers the
component in isolation — the empty-group case; expanded nesting with icons
and labels; group expansion (header toggle shows/hides children); active-
child highlighting; `onSelect` wiring; the collapsed rail's accessible name
and visible tooltip on hover; the flyout opening with child icons and
labels and closing on selection; keyboard operation (Enter opens the
flyout, focus moves into it, Escape closes and returns focus to the
trigger); and active-child highlighting inside the flyout.
`NavDrawer.test.jsx` (7 tests, with `tenantManagementNav.js` mocked to a
fixture child) covers the real wiring: platform-area gating (never shown in
the tenant area, even with a visible child available); icons-and-labels
nesting on both the expanded rail and the phone drawer; the phone drawer
closing after a child is selected; the collapsed rail's flyout; and the
empty-group case again through `NavDrawer` itself, with an empty child list
supplied. `tenantManagementNav.test.js` (7 tests) exercises the real,
unmocked filter directly — proving it returns no children for any shape of
`entryPoints`, which is the "no invented authorization" guarantee as code,
not only as a comment. `LoginPage.test.jsx`'s existing platform-login test
gained one more assertion confirming the same empty-group outcome through
the real, unmocked login → access-context → platform-shell path end to
end. A manual pass in a local browser (root, already provisioned earlier
in this PRD's verification) confirmed the platform shell renders
exactly as before — only `Home` — with no visible regression from the new
navigation infrastructure.

### I0001-R024 / AC17 — `entryPoints.tenantManagement`

Closed the missing-contract gap the I0001-R023 evidence above flagged.
`GET /access/context` ([access.js](../../../apps/api/src/modules/admin-tenancy/apiRoutes/v1/access.js))
now derives `entryPoints.tenantManagement.{tenants, cells, portalUsers}`
from `permits(authorization, capability)` against the same
`platformCapabilities` `resolveAuthorization` already resolves for every
other route — `admin-tenancy::control::read` for `tenants` and `cells`,
`admin-tenancy::accounts::read` for `portalUsers` — never from
`entryPoints.platform` and never by exposing the capability list itself.
[`tenantManagementNav.js`](../../../apps/web/src/shell/tenantManagementNav.js)
now consumes this signal for real: a new `isChildVisible(child,
entryPoints)` requires both `child.implemented` and
`entryPoints.tenantManagement[child.authKey]`, replacing the always-`[]`
placeholder filter R023 shipped with. All three children remain
`implemented: false` (I0002 is Draft, not built), so the group stays
correctly hidden today regardless of authorization — confirmed live: a
manual pass showed `entryPoints.tenantManagement` as `{tenants: true,
cells: true, portalUsers: true}` for root, with the platform shell still
rendering only `Home`, no regression.

Verified with 6 new tests: 2 API tests
([access-context.test.js](../../../apps/api/tests/unit/access-context.test.js))
confirm `tenantManagement` is all `true` for root and all `false` for a
plain user (plus the existing tests' `toMatchObject`/`toEqual` assertions
extended to include it, so the schema's `strictObject` shape is exercised
on every case); 4 web tests
([tenantManagementNav.test.js](../../../apps/web/tests/tenantManagementNav.test.js))
cover `isChildVisible` directly — visible only when both implemented and
authorized, hidden when either alone is true, hidden when `entryPoints`
carries no `tenantManagement` at all, and that a child only ever consults
its own `authKey`, never a sibling's.

### One application shell (2026-09-25)

The separate platform shell (`/management`) and tenant shell
(`/app/:tenantId`) are replaced by one application shell. The split was a
UI concept only: the server authorizes management routes by capability,
whether or not a tenant is selected, and finds a tenant's cell from the
session, never from the URL.

- Routes: `/home` replaces both `/management` and `/app/:tenantId`.
  Management pages stay at `/management/tenants`, `/management/cells`, and
  `/management/portal-users`.
- Restoration: a selected tenant or platform entry lands on `/home`. Only a
  user with neither, but with eligible tenants, is sent to `/tenants`.
- `/tenants` stays reachable with a tenant selected, so the tenant control can
  switch tenants. Before, its guard redirected a selected tenant away.
- Navigation shows `Tenant Management` whenever its children are authorized.
  `AppShell` and `NavDrawer` no longer take `area` or `homePath`.
- The shell is keyed by the selected tenant's ID, so switching tenants still
  remounts it and clears tenant-specific UI state (R007).
- The tenant control shows `Select tenant` when no tenant is selected, not
  the operator's company name, which read as a selected tenant.
- `PlatformHome` and `TenantHome` are merged into `HomePage`. The
  `RequireTenantShellAccess` guard and `TenantUnavailableScreen` are removed;
  `RequirePlatformAccess` is renamed `RequireManagementAccess`, and a new
  `RequireHomeAccess` guards `/home`.
- The API's `entryPoints.platform` flag keeps its name; it now means "may use
  management destinations".
- After login or a required password change, `SessionProvider` selects the
  tenant automatically when exactly one is eligible and none is selected,
  using `GET /access/tenants` and `POST /access/select`. A failed selection
  (for example `CELL_UNAVAILABLE`) leaves the user unselected. Restoring an
  existing session never auto-selects.

## 14. Outstanding Questions

None.
