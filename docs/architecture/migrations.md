# Migration Strategy

## Purpose

Migrations create and update NAP database schemas.

NAP has two database targets:

- `admin`: central control data, sessions, tenants, portal users, RBAC, and
  provisioning records.
- `cell`: tenant-scoped business data, local tenant projections, reference
  data, and module tables.

Each module owns the migrations for its tables. The migration runner applies
those migrations to the module's database target.

## Why

NAP separates schema changes from data seeding and operator bootstrap.

Each step has one job:

- setup creates or finds the database and roles;
- migration creates schema objects and grants;
- seed inserts required starting data;
- bootstrap creates the first admin tenant and root portal user.

This avoids hidden setup work inside runtime startup.

## Module Registration

Each module exports a descriptor that names:

- the module;
- the target database;
- the target schema;
- the module migrations.

Admin and cell modules must have separate registries. Before opening a database
connection, descriptor validation must reject modules registered against the
wrong database, unknown cell schemas, duplicate module names, and missing
migration arrays.

## Migration Runner

The migration runner must process one database target at a time.

For `admin`, it migrates the `admin` schema.

For `cell`, it migrates these schemas in order:

- `cell`;
- `reference`;
- `app`;
- `reporting`.

The runner opens the database, applies pending migrations through
`pg-schemata`, then closes the connection. `pg-schemata` owns the migration
ledger, locking, transaction handling, and checksum checks.

## Admin Workflow

The operator interface must expose these root package commands for admin
database changes:

```sh
npm run db:setup:admin -- --env dev
npm run db:migrate:admin -- --env dev
npm run db:bootstrap -- --env dev
```

Use `test` or `prod` instead of `dev` for the matching environment.

The commands do this:

- `db:setup:admin`: create or find the admin database and roles.
- `db:migrate:admin`: apply admin migrations.
- `db:bootstrap`: create or verify the owning tenant, root portal user, and
  root membership under [M0001-02](../PRDs/modules/M0001-admin-tenancy/M0001-02-root-user-provisioning.md).

Bootstrap requires the admin schema. It creates operational data, not schema.
It does not create ordinary tenants or seed platform capability definitions.
Authorization grants the root user `platform_admin` capabilities from
`is_root = true`; bootstrap does not create a role assignment or depend on the
owning tenant's role seeds.

### Local And Render Setup

Local setup verifies the existing `nap-admin` and `nap-app` roles and credentials
and creates or verifies the Admin database. Development instructions must cover
establishing these roles on a new local installation.

Render setup creates or reconciles the Admin database resource, then uses
provider-issued credentials to create missing `nap-admin` and `nap-app` roles
or verify existing ones. Migrations run as `nap-admin`. Setup preserves existing
compatible resources and credentials and rejects incompatible configurations.

Persist resource identity and provisioning progress before advancing so retries
reuse the same resource after partial or uncertain failures. Production
maintenance verifies the service, workspace, and database identity, grants only
the temporary network access it needs, and removes that access on success or
failure. Failed cleanup retains recovery state for the next attempt.

The database-foundation deliverable includes Render configuration and development
and production guides covering prerequisites, private configuration, setup,
migrations, deployment, and recovery. Guides must identify later bootstrap,
login, and cell-management dependencies rather than imply they are implemented.

## Cell Workflow

Cell registration begins in the UI from Tenant Management -> Cells -> Register
cell. The UI sends a cell registration command to the admin API.

Cell registration creates:

- an `admin.cells` row with `enabled = false`;
- an `admin.cell_provisioning` row that stores the operation identity,
  environment, database name, current stage, status, and failure code.

The registration command does not create the physical database. It records the
intent and queues provisioning.

The provisioning runner must read each queued row and run:

1. setup;
2. migration;
3. seed;
4. activation.

Setup creates or finds the cell database and records `cell.physical_identity`.
Migration applies cell migrations. Seed loads reference data. Activation
verifies the cell identity, verifies required migrations and seed data,
publishes the runtime connection, and enables the cell.

If a step fails, the cell stays disabled and the provisioning row records the
failure.

Activation is not a separate npm script. The provisioning runner must activate
a cell only after setup, migration, and seed pass. It starts with the API
process and checks queued provisioning rows in the background.

## Seeds

Reference data is seeded during cell provisioning, after cell migration and
before activation.

The reference-data seed must load the committed country and currency snapshot,
then record the applied seed version in `reference.seed_versions`.

Tenant provisioning runs the system-role seeds defined by M0569.
These seeds are separate from Admin bootstrap.

Changing the reference seed version requires a seed rollout for existing cells.
New cells receive the required seed version during provisioning. Existing cells
require an explicit operator workflow before that version can be treated as
deployed everywhere. The requirements for that bulk rollout belong in a
separate operator-workflow specification.

## Rules

- Runtime startup does not run migrations.
- A migration must belong to a module descriptor.
- A descriptor must target the correct database and schema.
- Admin migration must run before admin bootstrap.
- Cell migration must run before cell seed.
- Cell seed must run before cell activation.
- A cell cannot be enabled until activation passes.
- A cell operation must reuse the registered cell UUID and operation identity.
- Failed cell provisioning is retried against the same registered cell.
- A migration's ID and contents are immutable after it has been applied to a
  persistent environment.
- Schema evolution may add or change tables through new migrations; the initial
  table count is not a permanent limit.
- Before that boundary, a pre-release baseline reset may consolidate migrations.
  Record the reset in the changelog and recreate affected disposable databases.
- A pre-release in-place edit to an applied migration ships a one-off SQL script
  in `apps/api/src/scripts/sql/`, named for the edited migration. The script
  brings an existing database to the edited schema and updates the ledger hash
  in one transaction, and the changelog entry names it. Operators run it as
  `nap-admin` before the next `db:migrate:admin`.

## What This Document Does Not Cover

This document explains the migration workflow. Separate documents should cover:

- admin module behavior;
- RBAC;
- module design;
- the core module;
- the module map.
