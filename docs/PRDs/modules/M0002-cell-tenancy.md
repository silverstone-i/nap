# M0002: Cell Tenancy

Status: in progress. M0002-01 and M0002-02 are complete. Last updated 2026-09-24.

## Purpose

Tenant business data lives in cells: separate databases, each holding the data
of one or more tenants. The admin database decides who
can sign in, which tenant a session has selected, and which cell holds that
tenant. Cell tenancy is everything that lets a cell safely serve one tenant's
request:

- find and trust the right cell database;
- scope every query to the session's tenant;
- keep local copies of the admin facts the cell needs (tenant, members,
  entitlements), because a cell cannot query the admin database.

M0002-01 has built the `cell` schema, its tables, and the cell migration runner.
The rest does not exist yet.

## Tables

All tables are in the `cell` schema and are owned by the `cell-tenancy` module.
M0002-01 creates every table in one module migration file. Later Work Units
add behavior on top of those tables, never schema.

| Table                      | Source                      | Holds                                                                                                                   | Row-level security (RLS) column |
| -------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `cell.physical_identity`   | Written during cell setup   | Cell ID, database name, provisioning operation ID, environment. One row.                                                | None; not tenant data           |
| `cell.tenants`             | `admin.tenants`             | Tenant ID, code, status, `revision`                                                                                     | `id`                            |
| `cell.tenant_members`      | `admin.portal_user_tenants` | Membership ID, tenant ID, `portal_user_id`, member type, `member_id` (the user record in this cell), status, `revision` | `tenant_id`                     |
| `cell.module_entitlements` | `admin.module_entitlements` | Tenant ID, module, enabled, `revision`                                                                                  | `tenant_id`                     |
| `cell.outbox`              | Written by the cell         | Cell-to-admin requests waiting for delivery, such as "turn portal access on for this user"                              | `tenant_id`                     |

Rules that apply to the copied tables (`tenants`, `tenant_members`,
`module_entitlements`):

- Every copied row keeps the admin `revision` it last applied. An incoming
  change with a lower or equal revision is ignored, so repeats and
  out-of-order deliveries are harmless.
- No foreign keys point from a cell to the admin database.
- The cell keeps no copy of logins. Audit fields (`created_by`, `updated_by`)
  hold the portal user ID. `cell.tenant_members` maps that ID to the person's
  user record.

## How a tenant request works

1. The browser sends its session cookie. The API reads `admin.sessions` and
   builds `request.session`, including `tenant`.
2. The API looks up the tenant's cell and takes that cell's connection from the
   runtime cell registry.
3. `withTenantTransaction` opens a transaction on the cell, sets
   `nap.tenant_id` and the actor IDs for that transaction only, and checks the
   tenant, membership, and entitlement copies.
4. The route runs its query. RLS limits every row to the selected tenant, even
   if the query has no tenant filter.
5. The response goes back to the browser. The cell never talks to the admin
   database, and the browser never names a cell.

## Work units

Each Work Unit below can be built, tested, and merged on its own. None depends
on a later one.

### M0002-01: Cell database foundation (large)

- One `cell-tenancy` migration file that creates the `cell` schema and all five
  tables above, with their models and a `cell-tenancy` module descriptor.
- A cell module registry, kept separate from the admin registry.
- A cell migration runner that migrates one cell database at a time, in schema
  order `cell`, `reference`, `app`, `reporting`.
- Grants for `nap-admin` (owns the schema, runs migrations) and `nap-app`
  (reads and writes rows at runtime; cannot create or alter tables, and cannot
  bypass RLS).
- An RLS rule on every tenant table, using the column in the Tables section:
  `<column> = NULLIF(current_setting('nap.tenant_id', true), '')::uuid`.
  With no setting, a query sees no rows.
- A catalog check, like `verifyAdmin`, that confirms a migrated cell database
  has the expected tables, grants, and RLS rules.

Proof: migrate a disposable cell database, rerun it with no changes, pass the
catalog check, show `nap-app` cannot create or alter a table, and show each tenant table
returns no rows when `nap.tenant_id` is not set.

The runner and registry are shared infrastructure (`infrastructure/` and
`application/`), not module code, because cell provisioning and access control
will also use them.

### M0002-02: Physical identity (small)

- A check that reads the `physical_identity` row and compares it against the
  cell's `admin.cells` record and `SELECT current_database()`.
- Cell provisioning writes the identity row during setup; this Work Unit does
  not write it. Provisioning has no PRD yet (see Out of scope).
- A mismatch, or no row at all, marks the cell not ready. No tenant data is
  read or written.

Proof: a database whose identity row names a different cell, or whose name
differs from `admin.cells`, is refused before any tenant query runs.

### M0002-03: Runtime cell registry and routing (medium)

- Load cell connections at startup from private configuration keyed by cell ID.
- Require each configured cell to exist in `admin.cells`, be enabled, and pass
  the M0002-02 identity check.
- Route by the session's tenant. A cell that cannot be reached returns
  `503 CELL_UNAVAILABLE` for its tenants only; admin routes keep working.

Proof: a tenant whose cell is unreachable gets `503`, and admin routes still
answer.

### M0002-04: Cell health and hot add (medium)

- Health-check each cell on start and on a timer. A failing cell stops
  receiving requests; the others keep serving. A recovered cell returns to
  service.
- Add a cell provisioned after startup without restarting the API (hot add).

Proof: with two cells and one stopped, the other keeps serving, and the stopped
one returns to service after it restarts. A cell registered after startup
serves its tenants without a restart.

### M0002-05: Tenant copy (medium)

- Apply tenant create, status, suspend, archive, and reinstate changes to
  `cell.tenants`, using the revision rule in the Tables section.

Proof: repeated and out-of-order changes leave the newest revision in place.

### M0002-06: Tenant context (medium)

A single helper, `withTenantTransaction(request, work)`, used by every tenant
route:

- rejects a session with no tenant (`TENANT_NOT_SELECTED`);
- gets the cell connection from M0002-03;
- opens a transaction and sets `nap.tenant_id`, `nap.actor_id`, and
  `nap.effective_user_id` with `set_config(..., true)`, so nothing leaks to the
  next request on a pooled connection;
- rejects a tenant that is missing or not active in `cell.tenants`
  (`TENANT_UNAVAILABLE`);
- makes the transaction read-only for a support session that is not acting as
  a specific user;
- commits on success and rolls back on error.

Proof: two tenants in one cell cannot see each other's rows through the
helper, and a pooled connection keeps no tenant setting after the transaction.

### M0002-07: Membership copy (medium)

- Apply membership changes to `cell.tenant_members`, using the revision rule.
- `withTenantTransaction` requires an active local membership for the acting
  user.
- Look up a member by `member_id`, so a change to a user record in the cell
  (for example, turning off portal access) can find the membership to update.

Proof: repeated and out-of-order membership changes leave the newest revision
in place; a user with no active local membership is refused by
`withTenantTransaction`; a lookup by `member_id` finds the membership.

### M0002-08: Entitlement copy (medium)

- Apply entitlement changes to `cell.module_entitlements`.
- Block routes for optional modules the tenant is not entitled to. Foundation
  modules, which every tenant gets, always pass.

Proof: a route for an optional module the tenant is not entitled to is
refused, an entitled one runs, and a foundation module route runs either way;
repeated and out-of-order entitlement changes leave the newest revision in
place.

### M0002-09: Cell outbox (medium)

- An append operation that writes a cell-to-admin request inside the caller's
  `withTenantTransaction`, so the request commits or rolls back with the
  change that made it.
- The claim, complete, and fail operations the delivery worker calls. Each row
  is claimed by one worker at a time.

Proof: a rolled-back change leaves no outbox row, another tenant cannot see
the row, and two concurrent claims never take the same row.

### M0002-10: Readiness and UI context (small)

- Extend the existing `GET /api/admin-tenancy/v1/control/cell-readiness`
  (M0001-06) to report the cell's physical identity check and migration state.
- Show the selected tenant and its cell in the application shell for platform
  operators.

Proof: readiness reports a matching cell as ready and a mismatched or
unmigrated cell as not ready with the reason; the shell shows the selected
tenant's cell for an operator and not for an ordinary tenant user.

## Delivery between admin and cells

An outbox is a table of pending messages. A change writes its message to the
outbox in the same transaction, and a background worker delivers it later, so
the change never waits on the other database:

- **Admin to cell.** A central change to a tenant, membership, or entitlement
  writes a row to `admin.outbox`. The admin change commits even when the cell
  is down, and the worker retries until delivery succeeds. The table exists
  (PR #23), but no admin code writes to it yet.
- **Cell to admin.** A change to a user's portal access writes a row to
  `cell.outbox`. The worker applies it to the admin login and membership and
  reports the result back to the cell.

A later workflow builds the worker. M0002 owns only what happens inside the
cell.

## Work Unit status

| Start order | Work Unit                                                                                     | Required work                                                                                                              | Tables                             | Status      | Blocker / evidence                                                                                   |
| ----------: | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------- |
|           1 | [M0002-01: Cell database foundation](M0002-cell-tenancy/M0002-01-cell-database-foundation.md) | Create all cell tables in one migration; implement the cell module registry, migration runner, grants, and RLS.            | All 5 cell tables                  | Complete    | [Verified 2026-09-23](M0002-cell-tenancy/M0002-01-cell-database-foundation.md#verification-evidence) |
|           2 | [M0002-02: Physical identity](M0002-cell-tenancy/M0002-02-physical-identity.md)               | Check the identity row against `admin.cells` and refuse a cell whose identity does not match; provisioning writes the row. | `physical_identity` (read)         | Complete    | [Verified 2026-09-24](M0002-cell-tenancy/M0002-02-physical-identity.md#verification-evidence)        |
|           3 | M0002-03: Runtime cell registry and routing                                                   | Load configured cells, validate them, and route by the session's tenant.                                                   | `admin.cells` (read)               | Not started |                                                                                                      |
|           4 | M0002-04: Cell health and hot add                                                             | Health-check and quarantine cells, return recovered cells, and add cells without a restart.                                | `admin.cells` (read)               | Not started |                                                                                                      |
|           5 | M0002-05: Tenant copy                                                                         | Apply tenant changes using the revision rule.                                                                              | `tenants`                          | Not started |                                                                                                      |
|           6 | M0002-06: Tenant context                                                                      | Provide `withTenantTransaction` with tenant settings, checks, and read-only support sessions.                              | `tenants`                          | Not started |                                                                                                      |
|           7 | M0002-07: Membership copy                                                                     | Apply membership changes and require an active local membership for tenant routes.                                         | `tenant_members`                   | Not started |                                                                                                      |
|           8 | M0002-08: Entitlement copy                                                                    | Apply entitlement changes and block routes for modules the tenant is not entitled to.                                      | `module_entitlements`              | Not started |                                                                                                      |
|           9 | M0002-09: Cell outbox                                                                         | Append cell-to-admin requests in the tenant transaction; provide claim, complete, and fail operations.                     | `outbox`                           | Not started |                                                                                                      |
|          10 | M0002-10: Readiness and UI context                                                            | Report cell identity and migration state; show the selected tenant and its cell.                                           | `physical_identity`, `admin.cells` | Not started |                                                                                                      |

## Status Tracking

- `Not started`: implementation has not begun.
- `In progress`: implementation or verification is underway.
- `Blocked`: record the decision or dependency preventing progress.
- `Complete`: the accepted PRD's requirements pass verification; record the evidence.

Update a row when its progress changes. Accept each Work Unit's PRD before
implementing it.
Cell Tenancy is complete when Work Units 01–10 are complete.

## Out of scope

M0002 depends on work that no document covers yet. Each item needs its own
PRD before it is built:

- The delivery worker that moves rows from `admin.outbox` to cells and from
  `cell.outbox` to admin, with retry rules and a view of failed deliveries.
- The admin code that writes an `admin.outbox` row when a tenant, membership,
  or entitlement changes.
- Cell provisioning: creating, migrating, and activating a cell database.
- Migration rollout: applying a new cell migration to every existing cell,
  with progress and failures an operator can see and retry.
- Access control: tenant role definitions stored in each cell.
- Support access consent: what a read-only support session may see and do.
