# M0001-00: Admin Database Foundation

## 1. Document Control

| Field                | Value                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Implemented                                                                                                                                                         |
| Type                 | Module Work Unit                                                                                                                                                    |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)                                                                                                                   |
| Related architecture | [Module design](../../../architecture/module-design.md), [Admin and cells](../../../architecture/admin-cells.md), [Migrations](../../../architecture/migrations.md) |
| Related PRDs         | M0001-01 through M0001-12, listed in the family document                                                                                                            |
| Related decisions    | Decisions recorded in this PRD                                                                                                                                      |
| Last reviewed        | 2026-09-20                                                                                                                                                          |

## 2. Purpose

Define the admin database schema, models, permissions, setup, and migration.

## 3. Scope

### Included

- All 12 admin tables and their `pg-schemata` schema objects.
- Models, repository registration, and the admin-tenancy module descriptor.
- Database roles, grants, constraints, and triggers.
- Local and Render Admin database setup, deployment configuration, setup guides, and the initial admin-tenancy migration.
- Verification of the installed schema and permissions.

### Excluded

- HTTP APIs, authentication, authorization decisions, and business workflows.
- All data seeding, including system roles and root-user bootstrap data.
- Creating, migrating, seeding, or activating physical cell databases.
- Data migration from or compatibility with the previous project.

## 4. Actors And Permissions

The two PostgreSQL roles are separate from the application roles
`platform_admin`, `support`, and `tenant_admin`.

| Database role | Purpose                                                      | Permissions                                                                                                                                                |
| ------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nap-admin`   | Database and role creation, migrations, seeds, and bootstrap | Owns the database, schema, and tables; has `CREATEDB` and `CREATEROLE`, without superuser or `BYPASSRLS` privileges.                                       |
| `nap-app`     | Application runtime                                          | Performs CRUD operations; owns no database objects and has no superuser, `CREATEDB`, `CREATEROLE`, or `BYPASSRLS` privileges or membership in other roles. |

### Runtime Grant Contract

Grant `nap-app` `CONNECT` on the selected database, `USAGE` on `admin`, and
`SELECT`, `INSERT`, `UPDATE`, and `DELETE` on all 12 admin tables.

CRUD grants remain subject to database constraints and triggers.

Revoke public access to module objects and prevent public schema creation.
Do not use blanket future-table grants.

### Row-Level Security

The migration must leave RLS disabled on admin tables. Application operations
enforce user and tenant access.

## 5. Concepts And Terminology

| Term          | Meaning                                                               |
| ------------- | --------------------------------------------------------------------- |
| Schema object | JavaScript object describing a table to `pg-schemata`                 |
| Model         | Database interface backed by a table's schema object                  |
| Setup         | Create or verify a database and its PostgreSQL roles                  |
| Migration     | Versioned change to schema objects, constraints, functions, or grants |

## 6. Functional Requirements

- M0001-00-R001: The module must define every table and named schema object in section 9 and the linked schema chapter.
- M0001-00-R002: Each table must have a JavaScript model extending `pg-schemata.TableModel`, exporting its schema object, and registered by table name in `repositories.js`; `descriptor.js` must register the module, admin database target, `admin` schema, models, migrations, and entitlement type.
- M0001-00-R003: `db:setup:admin` must create or verify the selected admin database and roles without deleting data or running bootstrap. Local setup uses existing `nap-admin` credentials; Render setup uses provider credentials to establish missing roles before maintenance runs as `nap-admin`.
- M0001-00-R004: `db:migrate:admin` must validate the admin registry before connecting, apply pending migrations as `nap-admin` through `pg-schemata`, and close connections on success or failure.
- M0001-00-R005: Migration must install and verify the grants, constraints, and triggers, and must leave RLS disabled on every admin table.
- M0001-00-R006: Setup and migration must report success, no change, or failure without exposing secrets; a failed or incomplete run must not report success.

## 7. Business Rules And Invariants

- M0001-00-R007: All foreign keys must reference tables in the admin database. The migration must create referenced tables before dependent tables.
- M0001-00-R008: Runtime SQL must enforce the uniqueness, relationship, immutability, audit timestamp, and append-only rules defined in M0001-00-01, including writes that bypass model helpers.
- M0001-00-R009: Setup must validate an existing database and role configuration before reusing it; it must reject an incompatible target without silently changing ownership or resetting credentials.
- M0001-00-R010: Do not change a migration’s ID or contents after it has been applied. Each migration must include its own schema definitions rather than import runtime model definitions.
- M0001-00-R011: Soft-deleted records must remain stored until an explicitly authorized manual purge; no scheduled job, startup task, migration, or other automatic process may purge them.

## 8. Lifecycle And State Transitions

| Starting state                                 | Command                | Result                                                    |
| ---------------------------------------------- | ---------------------- | --------------------------------------------------------- |
| Local database or Render database/roles absent | Setup                  | Create missing resources and verify the target            |
| Compatible database and roles exist            | Setup                  | Preserve data and report no change                        |
| Existing configuration is incompatible         | Setup                  | Fail with the mismatched setting identified               |
| Setup complete, no module schema               | Migrate                | Install the baseline schema and grants                    |
| Pending migrations exist                       | Migrate                | Apply pending changes under the library's ledger and lock |
| No pending migrations                          | Migrate                | Verify the target and report no migration applied         |
| Setup or migration fails                       | Retry after correction | Reuse verified resources; follow the migration ledger     |

Database creation may leave resources after a later setup failure because
`CREATE DATABASE` cannot run inside a transaction. Report what was created;
retry must not drop those resources. `pg-schemata` owns migration transactions,
locking, checksums, and the migration ledger.

## 9. Data Requirements

[Admin Schema Objects](M0001-00-01-admin-schema-objects.md) specifies the
columns, types, nullability, defaults, keys, relationships, checks, and indexes.
It is part of M0001-00-R001, not a separate Work Unit.

| Table in `admin`      | Exported schema object     | Behavior defined by |
| --------------------- | -------------------------- | ------------------- |
| `cells`               | `cellsSchema`              | WU 6                |
| `tenants`             | `tenantsSchema`            | WUs 1, 2, 7         |
| `portal_users`        | `portalUsersSchema`        | WUs 1, 2, 3, 8      |
| `portal_user_tenants` | `portalUserTenantsSchema`  | WUs 1, 2, 8         |
| `sessions`            | `sessionsSchema`           | WUs 4, 9            |
| `login_throttles`     | `loginThrottlesSchema`     | WU 3                |
| `platform_roles`      | `platformRolesSchema`      | WU 5                |
| `cell_provisioning`   | `cellProvisioningSchema`   | WU 6                |
| `provisioning_jobs`   | `provisioningJobsSchema`   | WU 8                |
| `module_entitlements` | `moduleEntitlementsSchema` | WU 10               |
| `cache_revisions`     | `cacheRevisionsSchema`     | WU 11               |
| `managed_events`      | `managedEventsSchema`      | WU 12               |

## 10. API Requirements

No HTTP route is introduced. Expose the architecture's package commands:

```sh
npm run db:setup:admin -- --env dev
npm run db:migrate:admin -- --env dev
```

`--env` selects `dev`, `test`, or `prod`. Validate the environment and all
required connection configuration before changing anything. Use that environment’s
database target and `nap-admin` and `nap-app` credentials. Credentials must not be command-line arguments or printed output.

### Setup Script

The root command calls a JavaScript setup entry point that:

1. Validates the selected environment's setup configuration before mutation.
2. For local setup, connects as the existing `nap-admin`, verifies both local roles, and creates or verifies the Admin database.
3. For Render, creates or reconciles the provider resource and uses provider credentials to create missing roles or verify existing ones before connecting as `nap-admin`.
4. Applies database connection and schema-creation restrictions.
5. Verifies ownership and role attributes, reports the result, and closes connections.

Setup follows the [local and Render workflow](../../../architecture/migrations.md#local-and-render-setup),
including saved resource identity, safe retries, temporary-access cleanup, and
operator guides. Provider credentials must not become runtime credentials.

### Module Migration

The module exports an initial `001-admin-tenancy` migration through its descriptor.
Its frozen schema objects create tables in this order:

1. `cells`, `portal_users`.
2. `tenants`.
3. `portal_user_tenants`, `sessions`, `login_throttles`, `platform_roles`, `cell_provisioning`.
4. `provisioning_jobs`, `module_entitlements`, `cache_revisions`, `managed_events`.

Install and verify the functions, triggers, and grants specified in §4 and the
schema chapter.

Model objects and the frozen migration must produce equivalent table contracts.
The 12 tables are the initial contract; later migrations may add tables or change
the schema. Runtime startup must not run migrations.
Commands return exit code zero only on success or verified no change, and a
nonzero code on failure. Report the target, migration ID, and safe error context.

## 11. Cross-Module Interactions

WUs 1–12 own runtime operations that use these tables; their implementation is
not required to verify this database foundation. The following model operations
belong to those Work Units:

| Work Unit | Model operation                             | Contract                                                                |
| --------- | ------------------------------------------- | ----------------------------------------------------------------------- |
| WU 1      | `portal_users.findCredentialByEmail(email)` | Select the password hash for authentication; ordinary reads exclude it. |
| WU 3      | `login_throttles.recordFailure(key, now)`   | Update the failure window atomically.                                   |
| WU 4      | `sessions.findByTokenHash(hash)`            | Select one active session for resolution.                               |
| WU 11     | `cache_revisions.advance(domain, entity)`   | Increment the revision in the source transaction.                       |
| WU 12     | `managed_events.append(event)`              | Provide the only runtime event-write method.                            |

WU 2 owns root bootstrap. WU 5 derives root capabilities from `is_root` and
defines role seeds and assignments for other users; tenant provisioning runs the
seeds in the cell. Cell setup, projections, and RLS belong to the receiving cell
modules. `pg-schemata` owns the migration ledger.

## 12. Security And Audit

- M0001-00-R012: `nap-app` must not own databases or tables, have superuser status or `CREATEDB`, `CREATEROLE`, or `BYPASSRLS` privileges, or inherit equivalent authority.
- M0001-00-R013: Setup, migration, and model diagnostics must omit passwords, password hashes, session secrets, connection strings, and secret-bearing SQL values.

Setup and migration must provide safe command output without depending on
WU 12’s administrative event API.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                                                                                             | Requirements                 |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| AC01      | All 12 schema objects, models, and repository entries match the migrated PostgreSQL catalog; no cell connection is required.                                                                                                | M0001-00-R001, M0001-00-R002 |
| AC02      | Local setup verifies existing roles; Render setup creates missing roles using provider credentials. Fresh setup produces an empty target; retries preserve existing rows and credentials and reject incompatible resources. | M0001-00-R003, M0001-00-R009 |
| AC03      | Migration creates all tables in dependency order, records success in the library ledger, and applies nothing on a repeated run.                                                                                             | M0001-00-R004, M0001-00-R007 |
| AC04      | Wrong-target descriptors fail before connection; migration failure leaves no falsely applied ledger entry; connections close on both paths.                                                                                 | M0001-00-R004, M0001-00-R006 |
| AC05      | Tests verify `nap-admin` ownership and migration access, CRUD grants for `nap-app` on all 12 tables, and rejection of DDL by `nap-app`; all admin tables have RLS disabled.                                                 | M0001-00-R005, M0001-00-R012 |
| AC06      | Direct SQL as `nap-app` rejects invalid foreign keys, duplicate constrained values, immutable-key changes, and event updates/deletes; valid writes maintain audit fields.                                                   | M0001-00-R007, M0001-00-R008 |
| AC07      | Changed applied migration contents fail checksum validation; new changes use a new migration.                                                                                                                               | M0001-00-R010                |
| AC08      | Success, repeat, partial setup, and failure output contain no credentials or secret-bearing values.                                                                                                                         | M0001-00-R006, M0001-00-R013 |
| AC09      | Archived rows remain stored after time passes, startup, setup, and migration; no automatic purge is configured or invoked.                                                                                                  | M0001-00-R011                |

### Verification Evidence

Final verification requires [PR #3](https://github.com/silverstone-i/nap/pull/3)
to be merged with passing CI.

Local validation on 2026-09-19: `npm run lint`, `npm run format:check`, `npm test`
(70 tests), `npm run test:db` (14 PostgreSQL 18 tests), `npm run build`,
`npm run licenses`, and `git diff --check` passed. Root setup and migration
commands reported `created`, `applied`, then `unchanged` on repeat runs against
an isolated database.

[Database tests](../../../../apps/api/tests/integration/admin-foundation.test.js)
cover catalog equivalence, constraints, grants, concurrent migration and
membership protection, rollback, checksum drift, root protections, retention,
and failure cleanup. [Provider-role tests](../../../../apps/api/tests/integration/provider-roles.test.js)
verify missing-role creation and retry using a non-superuser maintenance role.
[Render fixtures](../../../../apps/api/tests/unit/render-provisioning.test.js)
cover resource reconciliation, private state, configuration publication, and
maintenance-access cleanup. Live Render deployment has not been verified.

## 14. Outstanding Questions

None.
