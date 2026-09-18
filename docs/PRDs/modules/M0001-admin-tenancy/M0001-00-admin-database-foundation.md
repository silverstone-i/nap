# M0001-00: Admin Database Foundation

## 1. Document Control

| Field                | Value                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Draft                                                                                                                                                               |
| Type                 | Module work unit                                                                                                                                                    |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)                                                                                                                   |
| Related architecture | [Module design](../../../architecture/module-design.md), [Admin and cells](../../../architecture/admin-cells.md), [Migrations](../../../architecture/migrations.md) |
| Related PRDs         | M0001-01 through M0001-12, listed in the family document                                                                                                            |
| Related decisions    | Decisions recorded in this PRD                                                                                                                                      |
| Last reviewed        | 2026-09-18                                                                                                                                                          |

## 2. Purpose

Define the admin tables, models, database permissions, setup script, and module
migration for this greenfield project. Use `pg-schemata` 3.1.2, declared as
`^3.1.2` in `apps/api/package.json`.

## 3. Scope

### Included

- All 13 admin tables and their `pg-schemata` schema objects.
- Models, repository registration, and the admin-tenancy module descriptor.
- Database roles, grants, constraints, and triggers. No admin table requires RLS.
- Admin database setup and the initial admin-tenancy migration.
- Verification of the installed schema and permissions.

### Excluded

- HTTP APIs, authentication, authorization decisions, and business workflows.
- All data seeding, including system roles and root-user bootstrap data.
- Creating, migrating, seeding, or activating physical cell databases.
- Data migration or compatibility with the previous project; `nap-ts` is reference material only.

Units 1–12 define record access, API behavior, business rules, and integration.
They use this unit's storage contract and identify any required schema changes
here. A new business requirement does not silently extend a schema object.

## 4. Actors And Permissions

Database roles grant SQL privileges. They are separate from the application
roles `platform_admin`, `support`, and `tenant_admin`.

| Actor               | Required access                                               | Allowed outcome                                                | Prohibited outcome                                                |
| ------------------- | ------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------- |
| Setup operator      | Cluster authority to create the configured database and roles | Create or verify the selected environment's database and roles | Drop or reset an existing database as part of setup               |
| Migration role      | Own the admin schema and its objects                          | Apply registered admin migrations and grants                   | Migrate a cell target through the admin command                   |
| API runtime role    | Connect, use `admin`, and perform the table operations below  | Execute authorized application operations                      | Own tables, create schema objects, or inherit migration authority |
| Provisioning runner | Explicit central progress-write authority                     | Record trusted progress under unit 6's contract                | Derive database setup authority from ordinary runtime grants      |
| Browser caller      | No database credentials                                       | Use authorized API routes                                      | Connect directly to the admin database                            |

### Runtime Grant Contract

| Tables                                                                                                                              | Runtime privileges                     | Restrictions                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| `tenants`, `portal_users`, `portal_user_tenants`, `sessions`, `platform_roles`, `cells`, `provisioning_jobs`, `module_entitlements` | `SELECT`, `INSERT`, `UPDATE`           | No `DELETE`, `TRUNCATE`, ownership, or DDL privileges              |
| `system_roles`                                                                                                                      | `SELECT`                               | No data seeding is included in this work unit                      |
| `managed_events`                                                                                                                    | `SELECT`, `INSERT`                     | No update, delete, truncate, or archive operation                  |
| `cell_provisioning`                                                                                                                 | `SELECT`, `INSERT`, `UPDATE`           | Progress updates use the trusted runner operation                  |
| `cache_revisions`                                                                                                                   | `SELECT`, `INSERT`, `UPDATE`           | Writes use the atomic `advance` model method                       |
| `login_throttles`                                                                                                                   | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | Delete is limited to expired rows through the authentication model |

Grant `CONNECT` on the selected database and `USAGE` on `admin`. Revoke public
access to module objects and prevent public schema creation. Do not use blanket
future-table grants. Throttle cleanup behavior remains in M0001-03; no
retention job receives deletion authority by implication.

### Row-Level Security

Admin-tenancy tables do not use RLS. Application operations enforce user and
tenant access; database grants restrict the SQL operations each role can perform.
The migration must not enable RLS or install RLS policies on admin tables.

## 5. Concepts And Terminology

| Term          | Meaning                                                               |
| ------------- | --------------------------------------------------------------------- |
| Schema object | JavaScript object describing a table to `pg-schemata`                 |
| Model         | Database interface backed by a table's schema object                  |
| Setup         | Create or verify a database and its PostgreSQL roles                  |
| Migration     | Versioned change to schema objects, constraints, functions, or grants |
| Seed          | Insert required starting data after migration                         |
| Bootstrap     | Establish the Napsoft tenant, root portal user, and root membership   |

## 6. Functional Requirements

- M0001-00-R001: The module must define every table and named schema object in section 9 and the linked schema chapter.
- M0001-00-R002: Each table must have a JavaScript model registered by table name in `repositories.js`; `descriptor.js` must register the module, admin database target, `admin` schema, models, migrations, and entitlement type.
- M0001-00-R003: `db:setup:admin` must create or verify the selected admin database and roles without deleting data or running bootstrap.
- M0001-00-R004: `db:migrate:admin` must validate the admin registry before connecting, apply pending migrations through `pg-schemata`, and close connections on success or failure.
- M0001-00-R005: Migration must install and verify the grants, constraints, and triggers, and must leave RLS disabled on every admin table.
- M0001-00-R006: Setup and migration must report success, no change, or failure without exposing secrets; a failed or incomplete run must not report success.

## 7. Business Rules And Invariants

- M0001-00-R007: All foreign keys must reference tables in the admin database. The migration must create referenced tables before dependent tables.
- M0001-00-R008: Runtime SQL must enforce the uniqueness, relationship, immutability, audit timestamp, and append-only rules defined in M0001-00-01, including writes that bypass model helpers.
- M0001-00-R009: Setup must validate an existing database and role configuration before reusing it; it must reject an incompatible target without silently changing ownership or resetting credentials.
- M0001-00-R010: Migration IDs and contents must remain immutable after application to a persistent environment; migrations must contain frozen schema definitions rather than importing changing runtime model objects.

The tenant/cell foreign key is `admin.tenants.cell_id` → `admin.cells.id`.
Both tables are created here. A null `cell_id` permits a tenant record before
assignment; assignment and provisioning operations remain separate work.

- M0001-00-R013: Soft-deleted records must remain stored until an explicitly authorized manual purge; no scheduled job, startup task, migration, or other automatic process may purge them.

Database constraints enforce structure. Units 1–12 define permitted operations
and state changes.

## 8. Lifecycle And State Transitions

| Starting state                         | Command                | Result                                                    |
| -------------------------------------- | ---------------------- | --------------------------------------------------------- |
| Database or roles absent               | Setup                  | Create missing resources and verify the target            |
| Compatible database and roles exist    | Setup                  | Preserve data and report no change                        |
| Existing configuration is incompatible | Setup                  | Fail with the mismatched setting identified               |
| Setup complete, no module schema       | Migrate                | Install the baseline schema and grants                    |
| Pending migrations exist               | Migrate                | Apply pending changes under the library's ledger and lock |
| No pending migrations                  | Migrate                | Verify the target and report no migration applied         |
| Setup or migration fails               | Retry after correction | Reuse verified resources; follow the migration ledger     |

Database creation may leave resources after a later setup failure because
`CREATE DATABASE` cannot run inside a transaction. Report what was created;
retry must not drop those resources. `pg-schemata` owns migration transactions,
locking, checksums, and the migration ledger.

## 9. Data Requirements

[Admin Schema Objects](M0001-00-01-admin-schema-objects.md) defines the review baseline:
columns, types, nullability, defaults, keys, relationships, checks, and indexes.
It is part of M0001-00-R001, not a separate work unit.

| Table in `admin`      | Exported schema object     | Behavior defined by |
| --------------------- | -------------------------- | ------------------- |
| `cells`               | `cellsSchema`              | Unit 6              |
| `tenants`             | `tenantsSchema`            | Units 1, 2, 7       |
| `portal_users`        | `portalUsersSchema`        | Units 1, 2, 3, 8    |
| `portal_user_tenants` | `portalUserTenantsSchema`  | Units 1, 2, 8       |
| `sessions`            | `sessionsSchema`           | Units 4, 9          |
| `login_throttles`     | `loginThrottlesSchema`     | Unit 3              |
| `system_roles`        | `systemRolesSchema`        | Unit 5              |
| `platform_roles`      | `platformRolesSchema`      | Unit 5              |
| `cell_provisioning`   | `cellProvisioningSchema`   | Unit 6              |
| `provisioning_jobs`   | `provisioningJobsSchema`   | Unit 8              |
| `module_entitlements` | `moduleEntitlementsSchema` | Unit 10             |
| `cache_revisions`     | `cacheRevisionsSchema`     | Unit 11             |
| `managed_events`      | `managedEventsSchema`      | Unit 12             |

Audit-enabled tables use `created_at`, `updated_at`, `created_by`, and
`updated_by`; actor fields permit a missing portal user for non-session work.
Archived records retain their keys and references. There is no automatic purge
of soft-deleted records. Archive and restore behavior belongs to the relevant operational PRD. No
cascade deletion or manual purge authority is implied.

## 10. API Requirements

No HTTP route is introduced. Expose the architecture's package commands:

```sh
npm run db:setup:admin -- --env dev
npm run db:migrate:admin -- --env dev
```

`--env` selects `dev`, `test`, or `prod`. Validate the environment and all
required connection configuration before changing anything. Use the selected environment’s connection configuration for database and role
names. Credentials must not be command-line arguments or printed output.

### Setup Script

The root command calls a JavaScript setup entry point that:

1. Resolves the chosen environment's admin target and setup credentials.
2. Connects to the configured maintenance database.
3. Creates missing roles and the admin database, or verifies existing resources.
4. Applies database connection and schema-creation restrictions.
5. Verifies ownership and role attributes, reports the result, and closes connections.

### Module Migration

The module exports an initial `001-admin-tenancy` migration through its descriptor.
Its frozen schema objects create tables in this order:

1. `cells`, `portal_users`, `system_roles`.
2. `tenants`.
3. `portal_user_tenants`, `sessions`, `login_throttles`, `platform_roles`, `cell_provisioning`.
4. `provisioning_jobs`, `module_entitlements`, `cache_revisions`, `managed_events`.

Then install required functions, triggers, and grants. Do not install RLS policies. Validate foreign
keys and privilege restrictions before reporting success. Do not insert root
records, register physical cells, or seed capability definitions in this migration.

Model objects and the frozen migration must produce equivalent table contracts.
Later accepted changes use a new migration; runtime startup never migrates.
Commands return exit code zero only on success or verified no change, and a
nonzero code on failure. Report the target, migration ID, and safe error context.

## 11. Cross-Module Interactions

Units 1–12 depend on this unit's accepted schema. Implementing those APIs is not
required to verify this unit. This unit creates empty tables and does not seed data.
Role initialization and root bootstrap belong to units 5 and 2.

Cell projections, cell-local RLS, and physical provisioning are planned external
dependencies. Creating `admin.cells` does not create a cell database. The migration
ledger belongs to `pg-schemata` and is not a fourteenth module table.

## 12. Security And Audit

- M0001-00-R011: Runtime credentials must not be database owners, superusers, or roles with `CREATEDB`, `CREATEROLE`, or `BYPASSRLS`, and must not inherit equivalent authority.
- M0001-00-R012: Setup, migration, and model diagnostics must omit passwords, password hashes, session secrets, connection strings, and secret-bearing SQL values.

Database grants do not make raw model rows safe API responses. Unit 1 defines
ordinary record access; units 3 and 4 define explicit credential access.
Unit 12 defines administrative event behavior. Setup and
migration must work before that event API exists and provide safe command output.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                                                              | Requirements                 |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| AC01      | All 13 schema objects, models, and repository entries match the migrated PostgreSQL catalog; no cell connection is required.                                                                 | M0001-00-R001, M0001-00-R002 |
| AC02      | Setup creates an empty target; a second run preserves rows and credentials; incompatible targets fail without destructive changes.                                                           | M0001-00-R003, M0001-00-R009 |
| AC03      | Migration creates all tables in dependency order, records success in the library ledger, and applies nothing on a repeated run.                                                              | M0001-00-R004, M0001-00-R007 |
| AC04      | Wrong-target descriptors fail before connection; migration failure leaves no falsely applied ledger entry; connections close on both paths.                                                  | M0001-00-R004, M0001-00-R006 |
| AC05      | Tests using each actual database role permit required operations and reject DDL and forbidden writes; all admin tables have RLS disabled.                                                    | M0001-00-R005, M0001-00-R011 |
| AC06      | Direct SQL under the relevant runtime role rejects invalid foreign keys, duplicate constrained values, immutable-key changes, and event updates/deletes; valid writes maintain audit fields. | M0001-00-R007, M0001-00-R008 |
| AC07      | Changed applied migration contents fail checksum validation; new changes use a new migration.                                                                                                | M0001-00-R010                |
| AC08      | Success, repeat, partial setup, and failure output contain no credentials or secret-bearing values.                                                                                          | M0001-00-R006, M0001-00-R012 |
| AC09      | Archived rows remain stored after time passes, startup, setup, and migration; no automatic purge is configured or invoked.                                                                   | M0001-00-R013                |

## 14. Outstanding Questions

None.
