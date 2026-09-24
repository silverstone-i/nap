# M0002-01: Cell Database Foundation

## 1. Document Control

| Field                | Value                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Implemented                                                                                                                                                         |
| Type                 | Module Work Unit                                                                                                                                                    |
| Family               | [M0002: Cell Tenancy](../M0002-cell-tenancy.md)                                                                                                                     |
| Related architecture | [Module design](../../../architecture/module-design.md), [Admin and cells](../../../architecture/admin-cells.md), [Migrations](../../../architecture/migrations.md) |
| Related PRDs         | [M0001-00: Admin Database Foundation](../M0001-admin-tenancy/M0001-00-admin-database-foundation.md)                                                                 |
| Related decisions    | One migration file creates every `cell-tenancy` table                                                                                                               |
| Last reviewed        | 2026-09-23                                                                                                                                                          |

## 2. Purpose

Define the `cell` schema, its five tables, and the code that migrates a cell
database. Every later M0002 Work Unit and every module with cell tables builds
on this.

## 3. Scope

### Included

- The five `cell` tables, their `pg-schemata` schema objects, models, and the
  `cell-tenancy` module descriptor.
- One `001-cell-tenancy` migration that creates the schema, tables, grants, and
  RLS rules.
- A cell module registry and its validation.
- A cell migration runner that migrates one cell database.
- A catalog check that confirms a migrated cell database matches the contract.

### Excluded

- Creating a cell database or its roles, and writing its identity row. Cell
  provisioning owns this; M0002-02 owns the check that reads the row.
- Runtime connections to cells and routing requests to them (M0002-03).
- Applying admin changes to the copied tables (M0002-05, -07, -08).
- The `reference`, `app`, and `reporting` schemas. Their modules create them;
  the runner only orders them.
- Seeding reference data.

## 4. Actors And Permissions

M0001-00 setup establishes both PostgreSQL roles on the server.

| Database role | Use in a cell database                  | Permissions                                                                                                                |
| ------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `nap-admin`   | Runs migrations and writes the identity | Owns the `cell` schema and its tables. Not subject to RLS on tables it owns.                                               |
| `nap-app`     | Serves application requests             | Reads and writes rows as granted below. Owns nothing. Cannot create or alter tables. Subject to RLS on every tenant table. |

### Runtime grant contract

- `CONNECT` on the cell database and `USAGE` on `cell`.
- `SELECT` on `cell.physical_identity`.
- `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on `cell.tenants`,
  `cell.tenant_members`, `cell.module_entitlements`, and `cell.outbox`.
- No public access to `cell` objects, no public schema creation, and no
  default grants that would cover tables added by later migrations.

## 5. Concepts And Terminology

| Term                     | Meaning                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| Cell                     | A separate PostgreSQL database that holds business data for one or more tenants                    |
| Copied table             | A cell table that holds a copy of admin data, because a cell cannot query the admin database       |
| Row-level security (RLS) | A PostgreSQL rule, checked on every query, that hides rows the current tenant does not own         |
| Tenant setting           | The transaction setting `nap.tenant_id`, which names the tenant a request is for                   |
| Module registry          | The list of module descriptors whose migrations a database receives                                |
| Catalog check            | A comparison of the database's tables, columns, grants, and RLS rules against the schema objects   |
| Migration ledger         | The `pg-schemata` table that records which migrations a database has applied, with their checksums |

## 6. Functional Requirements

- M0002-01-R001: The module must define the five tables in section 9, each with a model that extends `pg-schemata.TableModel` and exports its schema object, registered by table name in the module's repositories.
- M0002-01-R002: The `cell-tenancy` descriptor must name the module, the `cell` database target, the `cell` schema, its models, its migrations, and entitlement type `infrastructure`.
- M0002-01-R003: The cell module registry must be separate from the admin registry. Validation must run before any connection opens and reject a descriptor that targets another database, uses a schema other than `cell`, `reference`, `app`, or `reporting`, repeats a module name or migration ID, lacks a migration array, or registers a model whose schema object names another schema or table.
- M0002-01-R004: The cell migration runner must connect to one cell database as `nap-admin`, apply pending migrations through `pg-schemata` one schema at a time in the order `cell`, `reference`, `app`, `reporting`, skip a schema with no registered module, run the catalog check, and close the connection on success and failure.
- M0002-01-R005: The runner must report `applied` or `unchanged` with the database name, and must not report success after a failed or incomplete run.
- M0002-01-R006: The migration must enable RLS on each tenant table with the rule `<column> = NULLIF(current_setting('nap.tenant_id', true), '')::uuid`, using the column in section 9. With no tenant setting, a query returns no rows.

## 7. Business Rules And Invariants

- M0002-01-R007: No cell table may have a foreign key to the admin database. Foreign keys between cell tables must reference tables the migration has already created.
- M0002-01-R008: `cell.physical_identity` must hold at most one row, and its columns cannot change once written.
- M0002-01-R009: The migration's ID and contents cannot change after it has been applied to a persistent environment, and it must contain its own schema definitions rather than import the runtime models.
- M0002-01-R010: Runtime startup must not run cell migrations. Cell provisioning calls the runner.

## 8. Lifecycle And State Transitions

| Starting state                   | Action  | Result                                                      |
| -------------------------------- | ------- | ----------------------------------------------------------- |
| Empty cell database              | Migrate | Create the schema, tables, grants, and RLS rules; `applied` |
| Pending migrations               | Migrate | Apply them under the `pg-schemata` ledger and lock          |
| No pending migrations            | Migrate | Run the catalog check; `unchanged`                          |
| Invalid registry                 | Migrate | Fail before connecting                                      |
| Migration or catalog check fails | Migrate | Fail; the ledger records nothing for the failed migration   |

## 9. Data Requirements

All tables are in the `cell` schema. Audit-enabled tables add `created_at`,
`updated_at`, `created_by`, and `updated_by`; the `*_by` fields hold portal
user IDs and may be null for background work. Soft-deleted tables add
`deactivated_at`; ordinary reads exclude rows where it is set. UUID primary keys use
`gen_random_uuid()` unless the value is copied from admin.

| Table                 | Schema object              | RLS column  | Behavior defined by |
| --------------------- | -------------------------- | ----------- | ------------------- |
| `physical_identity`   | `physicalIdentitySchema`   | None        | M0002-02            |
| `tenants`             | `tenantsSchema`            | `id`        | M0002-05, M0002-06  |
| `tenant_members`      | `tenantMembersSchema`      | `tenant_id` | M0002-07            |
| `module_entitlements` | `moduleEntitlementsSchema` | `tenant_id` | M0002-08            |
| `outbox`              | `outboxSchema`             | `tenant_id` | M0002-09            |

The migration creates `physical_identity` and `tenants` first, then the other
three, which reference `tenants`.

### `cell.physical_identity`

Records which registered cell this database is. Setup writes the row once.

| Column          | Type          | Rules                                                        |
| --------------- | ------------- | ------------------------------------------------------------ |
| `cell_id`       | `uuid`        | Primary key; the `admin.cells` ID; immutable                 |
| `database_name` | `varchar(63)` | Not null, immutable                                          |
| `operation_id`  | `uuid`        | Not null, immutable; the `admin.cell_provisioning` operation |
| `environment`   | `text`        | Not null, immutable; `dev`, `test`, or `prod`                |
| `created_at`    | `timestamptz` | Not null, default `now()`                                    |

A unique index on a constant expression limits the table to one row.

### `cell.tenants`

A copy of `admin.tenants` for tenants in this cell. Audit fields; soft delete
through `deactivated_at`, mirroring an archived admin tenant.

| Column        | Type          | Rules                                            |
| ------------- | ------------- | ------------------------------------------------ |
| `id`          | `uuid`        | Primary key; the `admin.tenants` ID; immutable   |
| `tenant_code` | `varchar(32)` | Not null, immutable                              |
| `status`      | `text`        | Not null; `pending`, `active`, or `suspended`    |
| `revision`    | `integer`     | Not null, `> 0`; the admin revision last applied |

### `cell.tenant_members`

A copy of `admin.portal_user_tenants` for this cell's tenants. Audit fields;
soft delete.

| Column           | Type      | Rules                                                                          |
| ---------------- | --------- | ------------------------------------------------------------------------------ |
| `id`             | `uuid`    | Primary key; the `admin.portal_user_tenants` ID; immutable                     |
| `tenant_id`      | `uuid`    | Not null, immutable; foreign key to `cell.tenants`                             |
| `portal_user_id` | `uuid`    | Not null, immutable; no foreign key                                            |
| `member_type`    | `text`    | Null or `employee`, `client`, `vendor_contact`, `contact`                      |
| `member_id`      | `uuid`    | The member's user record in this cell; no foreign key until that module exists |
| `status`         | `text`    | Not null; `pending`, `active`, or `suspended`                                  |
| `revision`       | `integer` | Not null, `> 0`                                                                |

Indexes: unique active (`portal_user_id`, `tenant_id`); (`tenant_id`, `member_id`).

### `cell.module_entitlements`

A copy of `admin.module_entitlements` for this cell's tenants. Audit fields.

| Column      | Type      | Rules                                                      |
| ----------- | --------- | ---------------------------------------------------------- |
| `id`        | `uuid`    | Primary key; the `admin.module_entitlements` ID; immutable |
| `tenant_id` | `uuid`    | Not null, immutable; foreign key to `cell.tenants`         |
| `module`    | `text`    | Not null, immutable                                        |
| `enabled`   | `boolean` | Not null, default `false`                                  |
| `revision`  | `integer` | Not null, `> 0`                                            |

Unique (`tenant_id`, `module`).

### `cell.outbox`

Cell-to-admin requests waiting for delivery. The columns match `admin.outbox`
so one worker can deliver in both directions. Audit fields.

| Column            | Type          | Rules                                                            |
| ----------------- | ------------- | ---------------------------------------------------------------- |
| `id`              | `uuid`        | Primary key, `gen_random_uuid()`, immutable                      |
| `tenant_id`       | `uuid`        | Not null, immutable; foreign key to `cell.tenants`               |
| `topic`           | `text`        | Not null, immutable; `portal_access`                             |
| `entity_id`       | `uuid`        | Not null, immutable; the member's user record (`member_id`)      |
| `revision`        | `integer`     | Not null, immutable, `> 0`                                       |
| `payload`         | `jsonb`       | Not null, immutable, default `'{}'`                              |
| `status`          | `text`        | Not null, default `pending`; `pending`, `delivered`, or `failed` |
| `attempts`        | `integer`     | Not null, default `0`, `>= 0`                                    |
| `next_attempt_at` | `timestamptz` | Not null, default `now()`                                        |
| `delivered_at`    | `timestamptz` | Set if and only if `status = 'delivered'`                        |
| `failure_code`    | `varchar(64)` | Null when `status = 'delivered'`                                 |

Indexes: unique (`topic`, `entity_id`, `revision`); (`status`,
`next_attempt_at`); (`tenant_id`, `status`).

## 10. API Requirements

No HTTP route and no package command. The module exposes one maintenance
function for cell provisioning to call:

```js
migrateCell({ endpoint, adminPassword, database }, (modules = cellModules));
// → { status: 'applied' | 'unchanged', database }
```

It validates the registry, connects as `nap-admin`, confirms it reached the
named database, migrates, runs the catalog check, and closes the connection.
Errors carry a code and the database name, never credentials.

## 11. Cross-Module Interactions

- Cell provisioning writes `cell.physical_identity` during setup. M0002-02
  reads it before a cell is used.
- M0002-05, M0002-07, and M0002-08 write the copied tables. M0002-09 writes
  `cell.outbox`.
- Cell provisioning calls `migrateCell` after setup and before seeding.
- Later cell modules register descriptors in the cell registry and receive
  their RLS rule from the same pattern.

## 12. Security And Audit

- M0002-01-R011: `nap-app` must not own cell objects, create or alter tables, or bypass RLS.
- M0002-01-R012: Runner output and errors must not contain passwords or connection strings.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                 | Requirements                 |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| AC01      | The five schema objects, models, and repository entries match the migrated catalog of a disposable cell database.                               | M0002-01-R001, M0002-01-R002 |
| AC02      | Invalid descriptors fail before any connection opens; the admin registry rejects a cell descriptor and the cell registry rejects an admin one.  | M0002-01-R003                |
| AC03      | A first run reports `applied`, a second reports `unchanged`, and a failed run records nothing in the ledger; connections close on every path.   | M0002-01-R004, M0002-01-R005 |
| AC04      | As `nap-app`, each tenant table returns no rows without a tenant setting and only that tenant's rows with one; `physical_identity` is readable. | M0002-01-R006                |
| AC05      | As `nap-app`, creating or altering a table fails, a second `physical_identity` row fails, and an identity change fails.                         | M0002-01-R008, M0002-01-R011 |
| AC06      | A changed applied migration fails checksum validation.                                                                                          | M0002-01-R009                |
| AC07      | API startup runs no cell migration, and runner output on success and failure contains no credentials.                                           | M0002-01-R010, M0002-01-R012 |
| AC08      | No foreign key in `cell` references the admin database.                                                                                         | M0002-01-R007                |

### Verification Evidence

Local validation on 2026-09-23: `npm run lint`, `npm run format:check`,
`npm test` (552 tests across the workspace, including 17 new unit tests),
`npm run build`, `npm run licenses`, and `git diff --check` passed.
`npm run test:db:local` passed all 171 tests against a disposable PostgreSQL
18 server, including the new cell foundation suite.

- [Cell registry tests](../../../../apps/api/tests/unit/cell-registry.test.js)
  cover every registry rejection, the split between the admin and cell
  registries, and the absence of cell migrations from runtime startup.
- [Cell foundation tests](../../../../apps/api/tests/integration/cell-foundation.test.js)
  cover concurrent migration, the catalog check, RLS for `nap-app` with and
  without a tenant setting, refused DDL, the single identity row, foreign
  keys, failed and changed migrations, and credential-free errors.

Final verification requires the pull request to merge with passing CI.

## 14. Outstanding Questions

None.
