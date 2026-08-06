# PRD 0002 — Schema migration and tenant provisioning

- **Status:** Approved
- **Date:** 2026-08-05
- **Related:** [ADR-0001](../ADRs/0001-api-layering-and-module-structure.md),
  [ADR-0005](../ADRs/0005-module-registry-migrations-and-seeding.md),
  [RULES/db-and-migrations.md](../RULES/db-and-migrations.md)

This PRD defines everything about schema migration for the platform
foundation: the migrator entry points, the extension policy, the admin
bootstrap, tenant provisioning, and the data each installs.
Implementation lands across several PRs; each references the section it
delivers.

## Problem

NAP has no way to take an empty database to a running platform. The module
registry compiles with an empty module list, migrations cannot run against
any schema, no tenant can be provisioned, and no user exists to log in as.

## Users and scenarios

- **Operator, fresh environment** — runs one bootstrap command against an
  empty database and gets the complete `admin` schema; runs the seed and
  gets a platform admin who can log in.
- **Operator, new client** — provisions a tenant from the CLI with a tenant
  code and company name; the tenant's schema exists, fully migrated, when
  the command exits 0.
- **Operator, upgrade** — after deploying a release that adds migrations,
  runs one command that migrates the `admin` schema and every active tenant
  schema, and can trust a non-zero exit means at least one schema needs
  attention.
- **Developer, new module** — adds migrations to a module directory and a
  registry entry; never writes schema-scope guards, ordering logic, or
  extension setup outside the migration itself.
- **CI** — runs all of the above as plain `npm test` integration tests
  against the workflow's Postgres service container.

## Scope

### Migrator entry points

`apps/api/src/db/migrator.ts` exposes three functions, all fed by the
module registry (`modulesForScope`, [RULES/db-and-migrations.md](../RULES/db-and-migrations.md)):

- `migrateAdmin()` — runs admin-scope modules' migrations against the
  `admin` schema.
- `migrateTenant(schemaName)` — runs tenant-scope modules' migrations
  against one tenant schema.
- `migrateAllTenants()` — enumerates active tenants from `admin.tenants`,
  migrates each sequentially, and reports per-schema results. Any failure
  produces a non-zero exit from the calling script; failures are never
  swallowed.

Scope filtering happens in the migrator via the registry. An admin-scope
module is never passed to a tenant schema or vice versa, and no migration
file ever tests which schema it is running in.

Every migration run is invoked through an npm script in
`apps/api/package.json`; nothing calls the migrator ad hoc.

### Forward-only contract

Per [ADR-0005](../ADRs/0005-module-registry-migrations-and-seeding.md):
migrations are `defineMigration({id, description, up})` — there is no
`down()` and no rollback surface, in the migrator or the CLI. Content
hashes are verified on every run, so an applied migration is immutable; a
correction is a new migration. Recovery from a bad migration is roll
forward, or restore from backup.

### Extension policy

Postgres extensions install at the point of first use: the migration whose
DDL needs an extension calls the migration context's `ensureExtensions()`
before that DDL, and nothing installs extensions up front — not the
bootstrap, not provisioning. `CREATE EXTENSION IF NOT EXISTS` is
idempotent, so repeated calls across migrations are free.

No extension is expected in the initial migrations: Postgres 18 ships uuid
generation (`gen_random_uuid()`, `uuidv7()`) in core, and password hashing
is Node-side bcrypt.

### Tenant provisioning

A service (`provisionTenant`) turns a tenant record into a live, migrated
schema with a working tenant admin, and a CLI (`db:provision`) wraps it
for operators. The service is the reusable core — the future root-gated
HTTP `tenants` module calls the same function.

Every new tenant follows one workflow:

1. Create the `admin.tenants` record.
2. Create the tenant schema and run `migrateTenant()`.
3. Collect the tenant admin's user information.
4. Add the tenant admin to the tenant's `employees` table as an app user
   with the `tenant_admin` role.
5. Add the app user to `admin.portal_users` with an active
   `admin.portal_user_tenants` binding to the tenant.

Service guarantees:

- Schema names are validated and normalized; reserved names (`admin`,
  `public`, `pg_*`, information/catalog schemas) are rejected.
- Re-runnable: provisioning an existing tenant applies only pending
  migrations and never destroys data. There is no `DROP SCHEMA` path in
  the service.
- A failure before the schema is live cleans up the `admin.tenants` row so
  a retry starts clean; failures propagate to a non-zero exit.

### Admin bootstrap

One idempotent npm script (`db:bootstrap`) takes an empty database to a
platform an admin can log in to: `CREATE SCHEMA IF NOT EXISTS admin`
(pg-schemata's bootstrap does not create schemas), `migrateAdmin()`, then
the provisioning workflow above for the root tenant.

The root tenant differs from a paying client in two respects: an empty
database has no operator to supply step 3's user information, so the root
admin's identity comes from the environment — `ROOT_TENANT_CODE`,
`ROOT_COMPANY`, `ROOT_EMAIL`, `ROOT_PASSWORD`, `BCRYPT_ROUNDS` — and the
bootstrap script feeds it through the same workflow, assigning
`platform_admin` in place of `tenant_admin`. These variables land
in `apps/api/.env.example` with safe local defaults in the same change
that first reads them ([RULES/api-server.md](../RULES/api-server.md)). The `admin`
schema holds the global tables; the `nap` schema holds the root tenant's
tenant-scope tables, exactly like any other tenant schema holds its own.

Running the script twice succeeds; the second run applies zero migrations
and changes no data.

### Reference data and dummy data

Reference and canon data install with the machinery that needs them:
`admin.countries` (ISO 3166-1) loads during bootstrap; the policy catalog
and the five immutable system roles install into each tenant schema during
provisioning, so step 4's `tenant_admin` role always exists to assign.
Migrations carry DDL only
([ADR-0005](../ADRs/0005-module-registry-migrations-and-seeding.md)); all
data loads through scripts.

Dummy data is a development concern, not a provisioning step: loading test
fixtures happens through standalone tools under `src/scripts/`, never
inside bootstrap or provisioning.

## Out of scope

Rollback and `down()` migrations (deliberately absent, not deferred);
tenant deprovisioning or schema reset; the login flow itself and anything
Redis; the HTTP `tenants` module (the provisioning service is its future
dependency, not its delivery); licensing enforcement; a data migration or
backfill framework — migrations carry DDL only, scripts carry data.

## Success criteria

- On a fresh database, `db:bootstrap` completes and yields the full login
  fixture: the portal user resolves by `ROOT_EMAIL`, the password
  verifies, the active binding reaches the employee in the `nap` schema,
  the employee carries `platform_admin`, and the role's wildcard policy
  exists in the `nap` schema.
- `db:provision` creates a further tenant end to end: record, schema,
  migrations, `tenant_admin` employee, portal identity with an active
  binding.
- Re-running either command changes nothing and exits 0.
- `migrateAllTenants()` covers every active tenant and skips none; one
  failing schema fails the run with a non-zero exit and a per-schema
  report.
- A migration whose content changed after being applied fails the run
  (hash verification).
- No migration file contains a schema-scope guard; no extension is
  installed that no migration uses.
- All of the above is asserted by integration tests running under plain
  `npm test` against the CI Postgres service container.
