# PRD 0003 — Role-based access control (RBAC)

- **Status:** Approved
- **Date:** 2026-08-07
- **Related:** [ADR-0004](../ADRs/0004-portal-user-login-and-tenant-selection.md),
  [ADR-0007](../ADRs/0007-rbac-self-contained-permission-cells.md),
  [ADR-0008](../ADRs/0008-rbac-resolution-any-cell-satisfies.md),
  [ADR-0009](../ADRs/0009-explicit-deny-deferred.md),
  [ADR-0010](../ADRs/0010-resource-splitting-instead-of-column-security.md),
  [ADR-0011](../ADRs/0011-rbac-schema.md),
  [ADR-0012](../ADRs/0012-rbac-caching-and-staleness.md),
  [ADR-0013](../ADRs/0013-standard-resource-routes.md),
  [RULES/api-standard-routes.md](../RULES/api-standard-routes.md)

## Overview

RBAC is a component of the Auth module. It defines who may do what in
a tenant: the grant model, the rules for combining roles, the roles
every tenant starts with, and the data each audience may see. Its
tables and routers are owned by the `core` code module.

NAP authenticates portal users but authorizes nothing: any login could
reach every route in every module. No tenant can run that way — an AP
clerk must not approve the invoice they entered, a project manager
must not see profit, and a client or vendor login must never see
internal cost data. Before the first business module router lands, the
platform needs a permission model those rules can be written in. The
architecture that delivers these requirements is recorded in ADRs
0007–0012.

## Users and scenarios

Three user types log in — employees, clients, and vendor contacts —
each bound to a tenant entity via `admin.portal_user_tenants`.

- **Tenant admin (Administrator)** — maintains roles and grants for
  their tenant; every other actor's access is data this actor edits.
- **Owner/controller** — reads cost and income together, e.g. a
  profitability report showing cost and income per project.
- **AP clerk** — enters and edits vendor invoices; cannot approve
  them.
- **Project manager (PM)** — works the projects they are assigned to;
  sees project cost data, never profit or revenue data.
- **Approver** — sees documents awaiting decision (e.g. only
  `submitted`) and approves or rejects them; cannot edit them.
- **Auditor** — views records across the tenant; changes nothing.
- **Field supervisor** — records field data (e.g. timesheets, daily
  logs) on their assigned projects.
- **Client contact** — follows their own projects through a portal
  view that exposes no internal cost, markup, or margin data.
- **Vendor contact** — sees and acts on their own company's documents
  (e.g. purchase orders, invoices), nothing else.

## Data tables

All four tables live in each tenant schema and are owned by the `core`
code module ([ADR-0011](../ADRs/0011-rbac-schema.md)). Standard audit
columns are omitted throughout.

### roles

| Column      | Type        | Notes                                            |
| ----------- | ----------- | ------------------------------------------------ |
| id          | uuid        | Primary key.                                     |
| code        | varchar(32) | Internal code, e.g. `tenant_admin`. Unique.      |
| name        | varchar(64) | Display name, e.g. Administrator.                |
| description | text        | Description.                                     |
| is_system   | boolean     | System roles are immutable (see Business rules). |
| tenant_code | varchar(6)  | Owning tenant.                                   |

### role_cells

One row per grant — a permission cell
([ADR-0007](../ADRs/0007-rbac-self-contained-permission-cells.md)).

| Column           | Type        | Notes                                                    |
| ---------------- | ----------- | -------------------------------------------------------- |
| id               | uuid        | Primary key.                                             |
| role_id          | uuid        | FK to roles.                                             |
| module           | varchar(32) | Code module, e.g. `core`.                                |
| router           | varchar(64) | Router name, e.g. `roles`.                               |
| action           | varchar(32) | Default `''` = router-wide cell; named action overrides. |
| level            | varchar(8)  | `none` \| `view` \| `update` \| `full`.                  |
| scope            | varchar(32) | One of the four data scopes (see Business rules).        |
| visible_statuses | text[]      | Default `'{}'` = all statuses.                           |

Unique `(role_id, module, router, action)`.

### entity_roles

| Column    | Type | Notes          |
| --------- | ---- | -------------- |
| id        | uuid | Primary key.   |
| source_id | uuid | FK to sources. |
| role_id   | uuid | FK to roles.   |

Unique `(source_id, role_id)`. Links the tenant-side entity to its
roles; a login reaches them through its `admin.portal_user_tenants`
binding's `entity_id`.

### cell_catalog

Read-only seed: the registry of grantable `(module, router, action)`
triples that role editors render from and `role_cells` rows are
validated against. Carries no grants.

| Column         | Type        | Notes                                     |
| -------------- | ----------- | ----------------------------------------- |
| id             | uuid        | Primary key.                              |
| module         | varchar(32) | Code module.                              |
| router         | varchar(64) | Router name.                              |
| action         | varchar(32) | Default `''` = the router-wide entry.     |
| label          | varchar(64) | Display label for role editors.           |
| sort_order     | integer     | Display order.                            |
| valid_statuses | text[]      | The statuses this router's documents use. |

## API

All endpoints under `/api/core/v1/` use standard CRUD
([RULES/api-standard-routes.md](../RULES/api-standard-routes.md))
unless noted. Every mutation through the first three routers
invalidates the affected users' cached permissions
([ADR-0012](../ADRs/0012-rbac-caching-and-staleness.md)).

| Method | Path                      | Description                                                                                      |
| ------ | ------------------------- | ------------------------------------------------------------------------------------------------ |
| CRUD   | /api/core/v1/roles        | Manage roles. All writes refused for system roles.                                               |
| CRUD   | /api/core/v1/role-cells   | Manage a role's grants. Writes validated against `cell_catalog`; refused for system roles.       |
| CRUD   | /api/core/v1/entity-roles | Assign and revoke roles on entities. Refuses any non-external role on a client or vendor entity. |
| CRUD   | /api/core/v1/cell-catalog | Read-only registry of grantable cells; all mutating routes disabled.                             |

## Business rules

Every rule below is testable as written; the success criteria restate
the load-bearing ones as assertions.

### Grant model

- Access is governed per (module, router). A grant carries an access
  level and a data scope.
- Levels are `none < view < update < full`, cumulative: a level
  satisfies every demand at or below it.
- Route demands follow the standard route table
  ([ADR-0013](../ADRs/0013-standard-resource-routes.md)): read routes
  (`getById`, `getWhere`, `archived`, `export-xls`, `ping`) require
  `view`; `update` and `bulk-update` require `update`; `create`,
  `bulk-insert`, `import-xls`, `archive`, and `restore` require
  `full`.
- Scopes: `all_projects` (every row in the tenant); `assigned_companies`
  (rows belonging to companies the user is a member of, via
  `company_members`); `assigned_projects` (rows belonging to projects
  the user is a member of, via `project_members`); `self` (rows whose
  entity foreign key equals the binding's `entity_id`).
- Assumption, stated rather than decided: every project belongs to
  exactly one company, so the scopes nest strictly. If a real tenant
  breaks this, the scope model needs revisiting.
- A router's rows are scoped at exactly one granularity: company-level
  and project-level documents never share a router
  ([ADR-0010](../ADRs/0010-resource-splitting-instead-of-column-security.md)).
  A user who needs company-wide access plus specific projects holds
  cells on two routers; no compound scope exists.
- A user may hold multiple roles. The resolution rules below constrain
  what holding several roles can mean.

### Roles

- Five system roles are seeded into every tenant schema at
  provisioning ([PRD 0002](0002-schema-migration-and-tenant-provisioning.md))
  and are immutable: no caller can rename, edit, or delete them. Their
  cells are maintained by seed as new modules add routers.
  - `platform_admin` — the root user's role, unrestricted: full
    access at `all_projects` scope on every router in every schema,
    the root tenant's included. Assigned at bootstrap
    ([PRD 0002](0002-schema-migration-and-tenant-provisioning.md)).
  - `support` — full access at `all_projects` scope on every router
    in a client tenant's schema and on the `admin` schema's routers,
    and no access at all in the root tenant's schema (`nap`): NAP's
    own books are closed to support. How NAP staff reach a tenant —
    cross-tenant access, impersonation — is the platform-administration
    PRD's concern, out of scope here.
  - `tenant_admin`, shown to tenants as **Administrator** — full
    access at `all_projects` scope on every router, including role
    management. `tenant_admin` is the internal code; every
    tenant-facing surface uses the display name.
  - `client` — cells only on the dedicated client-facing routers
    ([ADR-0010](../ADRs/0010-resource-splitting-instead-of-column-security.md)),
    at `self` scope.
  - `vendor_contact` — cells only on the dedicated vendor-facing
    routers, at `self` scope.
- A client or vendor entity can hold only its external system role;
  `core::entity-roles` refuses any other role on one. This makes the
  external data-separation requirement structural rather than a
  convention.
- The employee actor roles (owner/controller, AP clerk, project
  manager, approver, auditor, field supervisor) are seeded at
  provisioning as templates: ordinary, non-system roles the tenant
  admin may edit or delete freely.
- A grant naming a (module, router, action) absent from
  `cell_catalog` is refused.

### Actions and segregation of duties

- `approve`, `reject`, and `submit` are distinct grantable actions per
  router, separate from the router-wide grant.
- Creating or editing a document and approving it are separately
  grantable powers. A role with full edit rights on a router does not
  thereby gain approval rights on it.

### Status visibility

- A role can be limited to seeing only certain document statuses on a
  router — e.g. an approver sees only `submitted` documents.
- An empty status list means all statuses.

### Data separation

- PMs see project cost data but not profit or revenue data. The
  owner/controller sees both.
- Client and vendor logins never see internal cost, markup, or margin
  data, on any route.
- Posted accounting entries are immutable regardless of role. This is
  controller logic, not RBAC — no grant makes a posted entry editable —
  but it is a requirement of this PRD all the same.

### Resolution guarantees

- No effective permission may exist that was not written in some role.
- Combining roles must never synthesize access that no single role
  grants. Merge semantics are recorded in
  [ADR-0008](../ADRs/0008-rbac-resolution-any-cell-satisfies.md).
- Every access decision must be explainable by pointing at the single
  grant that allowed it.

### Propagation

- A grant change takes effect immediately on explicit cache
  invalidation, and within 15 minutes worst case without it.

## Out of scope

Field-level (column) permissions — not in NAP's domain
([ADR-0010](../ADRs/0010-resource-splitting-instead-of-column-security.md));
explicit deny and veto semantics
([ADR-0009](../ADRs/0009-explicit-deny-deferred.md) defers them);
cross-tenant access for NAP staff and impersonation (the
platform-administration PRD); licensing and entitlement checks (the
licensing PRD); the role-administration UI (grants are data; the
editor that maintains them is a later PRD); token issuance and session
policy — access and refresh token lifetimes, rotation, idle window,
and absolute session lifetime are session management, owned by the
forthcoming authentication PRD.

## Success criteria

- A request to a route whose demanded level no held grant reaches is
  refused; granting a role with that level admits it.
- A user with full edit rights on a router but no `approve` grant is
  refused on approve; a user with only `approve` is refused on edit.
- A user holding two roles can never read or write a row that neither
  role alone admits, asserted by tests combining scope-limited and
  status-limited roles.
- A system role refuses rename, cell edits, and deletion for every
  caller, including `tenant_admin`; a template role accepts all three.
- A grant naming a (module, router, action) absent from the catalog is
  refused.
- Granting an internal role to a client or vendor entity is refused.
- In the root tenant's schema, a `support` login reaches no route; in
  a client tenant's schema and on the `admin` schema's routers,
  `support` reaches every router at `full`.
- A role limited to `submitted` sees only submitted documents in every
  list and export on that router; a role with an empty status list sees
  every status.
- No resource readable by a PM-class role exposes a profit or revenue
  field; the owner/controller reads a profitability report showing
  cost and income per project.
- No response to a client or vendor login contains an internal cost,
  markup, or margin field.
- An update to a posted accounting entry is refused for every role,
  including tenant admin.
- After a grant edit, the next request reflects it when the cache was
  explicitly invalidated; without invalidation the old grant survives
  no longer than 15 minutes.
- Every allow decision can be traced to exactly one grant, by log or
  explain output naming the role and the grant.

## Revisions

- 2026-08-07 — Initial version.
