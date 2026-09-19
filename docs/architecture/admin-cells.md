# Admin and Cells Architecture

## Purpose

The admin database is NAP's control plane. It stores central identities,
sessions, tenant records, cell registry records, provisioning state, platform
permissions, and operator audit records.

Cell databases store tenant-scoped business data. A cell can hold one or more
tenants. The admin database decides which tenant belongs to which cell.

## Why

The admin/cell split keeps central control data separate from tenant business
data.

This gives NAP three useful boundaries:

- session and membership decisions stay central;
- tenant business data stays in cell databases;
- a cell outage does not require the whole API to stop serving admin and other
  healthy cells.

## Relationship Model

Admin owns the registry. Cells own tenant-local data.

The main relationship is:

```text
admin.cells.id  <-- admin.tenants.cell_id
```

`admin.cells` identifies a registered physical cell database. `admin.tenants`
assigns a tenant to one registered cell. Runtime routing uses the authenticated
session's tenant assignment to choose the cell handle.

The browser never supplies the cell. The API resolves it from admin data.

## Control Plane Records

### `admin.cells`

Records each cell database the API may use. Each record gives the cell a stable
UUID, stores the expected database name, and controls whether the cell can
receive tenant assignments.

### `admin.cell_provisioning`

Records resumable provisioning work for a registered cell. Each operation ties
the cell UUID, database name, environment, operation identity, current stage,
status, and failure reason together so setup, migration, seed, activation, and
retry use the same registered target.

### `admin.tenants`

Records each tenant and its assigned cell. It is the central source for tenant
status, provisioning state, RBAC readiness, and runtime cell selection.

## Cell Projection Records

Cells keep local projections of central records needed for tenant isolation and
runtime enforcement. These records avoid cross-database foreign keys while still
letting cell-local tables enforce tenant-scoped behavior.

### `cell.physical_identity`

Proves that a PostgreSQL connection points to the registered cell. Before
loading a runtime cell, the API must verify the stored cell UUID, database
name, operation ID, environment, and actual `current_database()`.

### `cell.tenants`

Projects central tenant identity into the cell database. Business tables can
reference and enforce tenant scope locally without a foreign key to the admin
database.

## Runtime Flow

At startup, the API must read the admin database setting and the configured
cell database map.

The cell database map ties each cell UUID to its database connection string.
The API uses that map to build a runtime registry:

- the UUID must exist in `admin.cells`;
- the registered cell must be enabled before it can receive tenant traffic;
- the database connection must pass a readiness check;
- ready cells can serve tenant routes;
- unavailable cells return service unavailable for their tenant routes.

The API must maintain the resulting connections and readiness state in a
runtime cell registry keyed by cell UUID.

## Registering A Cell

Cell registration is an operator command, not a browser-selected database
switch.

The UI sends a control command to:

```text
POST /api/admin-tenancy/v1/control/registry
```

with:

```json
{ "operation": "cell", "suffix": "east" }
```

The API:

1. locks central control changes;
2. validates the requested cell name;
3. creates an `admin.cells` row with `enabled = false`;
4. creates a queued `admin.cell_provisioning` row;
5. returns the cell ID.

An API-owned background runner must process the queued provisioning work.

## Provisioning And Activation

Each registration request creates one cell record. Background work then
prepares that cell.

For a new cell, it runs:

1. setup;
2. migration;
3. seed;
4. activation.

Setup creates or finds the physical database. Migration creates the cell
schema. Seed adds required starting data. Activation checks that the database is
the registered cell, then enables it for tenant traffic.

The operation must be marked completed only after those steps pass. If a step
fails, the cell stays disabled and the failure is saved for retry.

Retry uses:

```text
POST /api/admin-tenancy/v1/control/provision
```

with:

```json
{ "operation": "cell-retry", "cell": "<cell-uuid>" }
```

Disabling a cell uses:

```json
{ "operation": "cell-disable", "cell": "<cell-uuid>" }
```

Disabling sets `admin.cells.enabled` to false. It does not delete the database.

## Tenant Assignment

A tenant can be assigned only to an enabled registered cell.

Tenant creation uses:

```text
POST /api/admin-tenancy/v1/control/registry
```

with:

```json
{
  "operation": "tenant",
  "code": "ACME",
  "name": "Acme Construction",
  "tier": "starter",
  "cell": "<cell-uuid>"
}
```

A tenant may receive its first cell assignment when `cell_id` is null, including
the owning tenant after root bootstrap. Later reassignment is allowed only before
provisioning starts and while the tenant has no memberships.

## Readiness And Overview

Operators inspect cells through:

```text
GET /api/admin-tenancy/v1/control/overview
GET /api/admin-tenancy/v1/control/cell-readiness?cell=<cell-uuid>
```

The overview reports central records and registry state. A cell is available
only when `admin.cells.enabled` is true and the runtime registry says the cell
is ready.

The readiness endpoint checks the loaded cell's physical identity and reference
data readiness.

## Business Rules

- Admin owns cell registration and tenant-to-cell assignment.
- Each configured cell UUID must exist in `admin.cells`.
- Each cell connection must prove it points to the registered database before
  the API uses it.
- Tenant routes use the cell from the resolved session, never client input.
- One unavailable cell does not stop admin routes or healthy cells.
- A cell with `enabled = false` cannot receive new tenant assignments.
- Retry continues the same registered cell operation. It must not create a
  replacement cell.
- A provisioned tenant cannot move cells through a simple `cell_id` edit.

## What This Document Does Not Cover

This document explains the admin-to-cell relationship. Separate documents
should cover:

- migration, bootstrap, and seed workflow;
- the admin module;
- RBAC;
- module design;
- the core module;
- the module map.
