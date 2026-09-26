# M0002: Cell Tenancy

Status: complete. M0002-01 and M0002-02 are complete. Last updated 2026-09-24.

## Purpose

Tenant business data lives in cells: separate databases, each holding the data
of one or more tenants. The admin database decides who
can sign in, which tenant a session has selected, and which cell holds that
tenant. Cell tenancy owns the `cell` schema that every cell database starts
with:

- the tables that hold local copies of the admin facts a cell needs (tenant,
  members, entitlements), because a cell cannot query the admin database;
- the outbox table for cell-to-admin requests;
- the physical identity check that proves a connection reached the right
  cell.

Inter-module workflows move data in and out of these tables and serve tenant requests
through them. See Out of scope.

## Tables

All tables are in the `cell` schema and are owned by the `cell-tenancy` module.
M0002-01 creates every table in one module migration file. Inter-module workflows add
behavior on top of those tables, never schema.

| Table                      | Source                      | Holds                                                                                                                   |
| -------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `cell.physical_identity`   | Written during cell setup   | Cell ID, database name, provisioning operation ID, environment. One row.                                                |
| `cell.tenants`             | `admin.tenants`             | Tenant ID, code, status, `revision`                                                                                     |
| `cell.tenant_members`      | `admin.portal_user_tenants` | Membership ID, tenant ID, `portal_user_id`, member type, `member_id` (the user record in this cell), status, `revision` |
| `cell.module_entitlements` | `admin.module_entitlements` | Tenant ID, module, enabled, `revision`                                                                                  |
| `cell.outbox`              | Written by the cell         | Cell-to-admin requests waiting for delivery, such as "turn portal access on for this user"                              |

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
4. The route runs its query. Row-level security (RLS) on business tables
   limits every row to the selected tenant, even if the query has no tenant
   filter. `cell` tables have no RLS; only system code touches them.
5. The response goes back to the browser. The cell never talks to the admin
   database, and the browser never names a cell.

## Work units

M0002 owns the `cell` tables and the checks on them. Work that uses those
tables across the admin database, a worker, the registry, or tenant routes is
an inter-module workflow, not an M0002 Work Unit: the runtime cell registry is
[I0003](../inter-module-workflows/I0003-cell-provisioning.md), and the rest are listed
under Out of scope.

### M0002-01: Cell database foundation (large)

- One `cell-tenancy` migration file that creates the `cell` schema and all five
  tables above, with their models and a `cell-tenancy` module descriptor.
- A cell module registry, kept separate from the admin registry.
- A cell migration runner that migrates one cell database at a time, in schema
  order `cell`, `reference`, `app`, `reporting`.
- Grants for `nap-admin` (owns the schema, runs migrations) and `nap-app`
  (reads and writes rows at runtime; cannot create or alter tables, and cannot
  bypass RLS).
- No RLS on `cell` tables, the same as `admin` tables. The RLS rule for
  tenant business tables is set in M0002-01-R006.
- A catalog check, like `verifyAdmin`, that confirms a migrated cell database
  has the expected tables and grants, with RLS off.

Proof: migrate a disposable cell database, rerun it with no changes, pass the
catalog check, and show `nap-app` cannot create or alter a table.

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

[I0004](../inter-module-workflows/I0004-admin-cell-sync.md) builds both directions, including the code that reads and
writes the `cell` tables. M0002 owns only the tables.

## Work Unit status

| Start order | Work Unit                                                                                     | Required work                                                                                                              | Tables                     | Status   | Blocker / evidence                                                                                   |
| ----------: | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
|           1 | [M0002-01: Cell database foundation](M0002-cell-tenancy/M0002-01-cell-database-foundation.md) | Create all cell tables in one migration; implement the cell module registry, migration runner, and grants.                 | All 5 cell tables          | Complete | [Verified 2026-09-23](M0002-cell-tenancy/M0002-01-cell-database-foundation.md#verification-evidence) |
|           2 | [M0002-02: Physical identity](M0002-cell-tenancy/M0002-02-physical-identity.md)               | Check the identity row against `admin.cells` and refuse a cell whose identity does not match; provisioning writes the row. | `physical_identity` (read) | Complete | [Verified 2026-09-24](M0002-cell-tenancy/M0002-02-physical-identity.md#verification-evidence)        |

## Status Tracking

- `Not started`: implementation has not begun.
- `In progress`: implementation or verification is underway.
- `Blocked`: record the decision or dependency preventing progress.
- `Complete`: the accepted PRD's requirements pass verification; record the evidence.

Update a row when its progress changes. Accept each Work Unit's PRD before
implementing it.
Cell Tenancy is complete when Work Units 01 and 02 are complete.

## Out of scope

These build on the `cell` tables. Each needs its own PRD, other than I0003 and I0004,
before it is built:

- Cell provisioning and the runtime cell registry: [I0003](../inter-module-workflows/I0003-cell-provisioning.md).
- Tenant context: `withTenantTransaction(request, work)`, the entry point every
  tenant route uses. It gets the cell connection from I0003, sets
  `nap.tenant_id`, `nap.actor_id`, and `nap.effective_user_id` for that
  transaction only, rejects a session with no tenant or a tenant missing or
  not active in `cell.tenants`, and makes support sessions that are not acting
  as a user read-only. Needs tenant sync first; an inter-module workflow.

- Cell health: rechecking a cell's readiness after startup and returning a
  recovered cell to service. Extends the [I0003](../inter-module-workflows/I0003-cell-provisioning.md)
  runtime registry; owns no cell-tenancy table, so it is an inter-module workflow, not an
  M0002 Work Unit.
- Cell readiness and shell context: reporting the physical identity check and
  migration state on M0001-06's cell-readiness route, and showing an
  operator's selected tenant and cell in the application shell. Spans an
  admin-tenancy route and the browser shell; owns no cell-tenancy table, so
  it is an inter-module workflow, not an M0002 Work Unit.
- Admin-cell sync in both directions: tenant, membership, and entitlement
  copies from admin, and portal-access requests from `cell.outbox`:
  [I0004](../inter-module-workflows/I0004-admin-cell-sync.md).
- Requiring an active local membership in `withTenantTransaction`, and
  looking up a member by `member_id`. Part of tenant context.
- Entitlement checks: blocking routes for optional modules the tenant is not
  entitled to. Foundation modules always pass. An inter-module workflow.
- Cell provisioning: creating, migrating, and activating a cell database.
- Migration rollout: applying a new cell migration to every existing cell,
  with progress and failures an operator can see and retry.
- Access control: tenant role definitions stored in each cell.
- Support access consent: what a read-only support session may see and do.
