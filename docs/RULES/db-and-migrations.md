# RULES — DB layer

Governs `apps/api/src/db/`. Provisioning and seeding are not wired yet; this
doc covers what exists and grows with them.

## What lives here

Per [ADR-0001](../ADRs/0001-api-layering-and-module-structure.md), `db/` may
import `util/` and nothing else. It holds the connection singleton, the module
registry, the migrator, and (later) the Redis client.

- `connection.ts` — connection resolution, `initDb` / `getDb` / `closeDb` / `probeDb`
- `registry.ts` — the module registry and its two derived views
- `migrator.ts` — the three migration entry points
- `rows.ts` — the shared row-type building blocks (`AuditRow`, `EntityRow`)
  matching the columns pg-schemata appends for audit fields and soft delete
- `index.ts` — the barrel every other layer imports from

`registry.ts` imports each module's descriptor from
`modules/<feature>/<feature>Repositories.ts` — the one sanctioned upward
import in the layer order, because the registry _is_ the hand-maintained list
of modules (ADR-0001). Descriptor imports are the only thing it may pull from
`modules/`.

Import from `db/index.js`, not from the files behind it.

## Connection resolution

`resolveConnectionString(env)` maps `NODE_ENV` to a variable: `production` →
`DATABASE_URL_PROD`, `test` → `DATABASE_URL_TEST`, everything else →
`DATABASE_URL_DEV`. It takes the environment as an argument and reads no
ambient `process.env` — entrypoints (`server.ts`, later `scripts/`) own that
read, per [RULES/api-server.md](api-server.md). Keep it that way: it is what
makes the mapping testable without mutating the process environment.

A missing or blank variable throws, naming both the variable and the
`NODE_ENV` that selected it. There is no fallback chain and no default
localhost URL — an unset database URL is a configuration bug, not a case to
paper over.

## The singleton contract

pg-schemata's `DB` is a process-wide singleton. `DB.init` silently ignores a
second call, which would hand back a handle pointing at the first connection,
so NAP wraps it:

- `initDb(connection, logger?, modules?)` — call once, at an entrypoint, before
  anything queries. Re-initializing with a _different_ connection throws.
- `getDb()` — the handle. pg-schemata's own `db()` returns `undefined` before
  init; `getDb()` throws instead. Never import `db` from `pg-schemata` directly.
- `closeDb()` — terminal. The singleton cannot be re-initialized after the pool
  drains, so this is process shutdown only, never per-test teardown of a suite
  that keeps running.
- `probeDb()` — a `SELECT 1` round trip, used at startup to fail fast.

## The module registry

`moduleRegistry` in `registry.ts` is hand-maintained and is one of the two
registration points a new module touches (the other is `apiRoutes.ts`).

An entry is pg-schemata's `ModuleDescriptor` plus ADR-0001's two properties:

```ts
{ name, schemaScope: 'admin' | 'tenant', licensable: boolean, models?, migrations }
```

Notes that matter when adding one:

- The models field is `models`, not the `repositories` name used in
  [ADR-0005](../ADRs/0005-module-registry-migrations-and-seeding.md). pg-schemata
  2.0.0 shipped `models`, and matching the library lets a descriptor pass
  straight to `MigrationManager` with no adapter layer. Same thing, library's
  spelling.
- `schemaScope` is single-valued. A module owning tables in both scopes
  registers two descriptors — `core` does exactly this (`core-admin` for
  `admin.countries`, `core-tenant` for the tenant tables).
- `migrations` array order is authoritative within a module; the migrator never
  re-sorts it.

Conventions the registered modules follow:

- A module defines its descriptor(s) in `<feature>Repositories.ts` at the
  module root and carries a `declare module 'pg-schemata'` `Repositories`
  augmentation there for its repository names — that augmentation is what
  types `getDb().<repo>` and `callDb('<repo>', schema)`.
- Table models live one-per-file in `modules/<feature>/models/`, each file
  exporting the row type, the `TableSchema` const, and the `TableModel`
  subclass whose constructor matches pg-schemata's `RepositoryCtor` shape.
- Admin-scope models declare `dbSchema: 'admin'`. Tenant-scope models declare
  the inert placeholder `dbSchema: 'tenant'`; every runtime access rebinds via
  `forSchema()` / `callDb()` — never `SET search_path`, and never a query
  against the placeholder schema itself.

`modulesForScope(scope)` filters by scope — scope guarding is the registry's
job, so no migration ever tests which schema it is running in.
`collectRepositories()` flattens every module's models into the single map
`DB.init` takes, and throws when two modules claim the same repository name:
repository names share one namespace on the db handle.

## The migrator

`migrator.ts` owns every migration run
([PRD 0002](../PRDs/0002-schema-migration-and-tenant-provisioning.md)). Three
entry points, all registry-fed:

- `migrateAdmin()` — admin-scope modules against the `admin` schema.
- `migrateTenant(schemaName)` — tenant-scope modules against one tenant
  schema. Throws on a blank name and on `admin`: a tenant run can never
  target the admin schema.
- `migrateAllTenants()` — enumerates `admin.tenants` (status `active`, not
  soft-deleted), migrates each schema sequentially, and continues past
  failures. When any schema failed it throws `TenantMigrationsError` after
  the run, carrying the full per-schema result list — an uncaught throw
  exits the calling script non-zero.

Rules that hold for every caller:

- Scope filtering happens here via `modulesForScope`. Never construct a
  `MigrationManager` outside `migrator.ts`, and never write a migration
  that tests which schema it is running in.
- Migration runs are invoked through npm scripts in `apps/api/package.json`
  (PRD 0002), which are wired when the bootstrap and provisioning scripts
  land.
- `migrateAllTenants()` needs the db singleton initialized (`initDb`) —
  tenant enumeration queries `admin.tenants` through `getDb()`. The other
  two entry points reach the pool through pg-schemata's own singleton.
- The entry points take injectable seams (`modules`, `createManager`,
  `listTenantSchemas`) so unit tests run without a database. Production
  callers pass none of them.

## Tests

DB layer tests live in `apps/api/tests/db/`, mirroring this directory —
never beside the source files
([ADR-0006](../ADRs/0006-tests-live-under-tests.md)).

DB-backed tests run under plain `npm test` against `DATABASE_URL_TEST` — there
is no mocked-DB tier (ADR-0005). `apps/api/vitest.config.ts` loads a local
`.env` into the test environment so a developer's configuration drives them the
same way CI's Postgres service container does.

Integration tests gate on the variable being present
(`describe.skipIf(!process.env.DATABASE_URL_TEST)`) and log why they skipped.
CI always sets it, so the tests are enforced there; a contributor without a
local Postgres still gets a green `npm test`.

Tests that mutate the DB singleton (`initDb`) belong in their own file — the
singleton is not resettable, so a file that inits cannot also assert
pre-init behavior.
