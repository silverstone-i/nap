# 0005 — Module registry, migrations, and seeding

- **Status:** Accepted
- **Date:** 2026-08-02

## Context

Roadmap item 1 ([DESIGN.md](../architecture/DESIGN.md) §7) builds the platform
foundation: a migrator, a module registry, the admin-schema bootstrap, tenant
provisioning, and the seed scripts that produce the login fixture. ADR-0001
fixed the module shape — module-owned `schema/migrations/`, schema scope and
licensability as descriptor data — but left the surrounding machinery
undecided.

The machinery pg-schemata 1.7.0 ships is not sufficient. Its `MigrationManager`
tracks migrations per `(schema_name, version)`, which has no room for the module
dimension NAP's registry introduces, and it orders nothing across modules. That
gap has to close somewhere before NAP can write its first migration, and where
it closes is a decision this ADR makes. What the closed gap looks like in detail
is pg-schemata's design problem, recorded in that repository, not here.

## Decision — the migrator gap closes in pg-schemata, not in NAP

pg-schemata is an owned library, so the missing capabilities go into it and NAP
pins the resulting release. NAP carries no migrator wrapper and no parity layer.

The capabilities NAP depends on, stated as requirements rather than as a design:

- Tracking keyed on `(schema_name, module_name, migration_id)`, so two modules
  can migrate the same schema independently.
- Registry input: ordered arrays of migration objects supplied per module.
- Dependency ordering across modules and across the models inside a single
  migration, failing loudly on a cycle.
- A migration context carrying the target schema, the module, a database handle,
  a logger, and models already bound to that schema.
- Content hashes verified on every run, not merely recorded. A migration whose
  content changed after it was applied fails the run.
- Failures propagating to a non-zero exit status.
- Forward-only: no `down()`, no rollback surface.

pg-schemata's per-schema advisory lock, single-transaction run, `listPending`,
and dry-run already meet the need and stay as they are.

Two responsibilities stay on the NAP side of the line. Scope guarding is the
registry's job — it filters modules by `schemaScope` before the migrator runs,
so no migration file ever tests which schema it is executing in. And
`migrateAllTenants()` is NAP-side, because enumerating `admin.tenants` is an
application concern.

## Decision — migrations are TypeScript, compiled with everything else

A migration is `defineMigration({id, description, up})`, and each module exports
an ordered array of them from its `schema/migrations/` directory. Migrations
compile to `dist/` with the rest of `src/` — no `.mjs` files, no copy step. One
compiler pass, one module system, and migrations typechecked against the same
models they create, all consistent with ADR-0002.

## Decision — module registry descriptor

The registry entry per ADR-0001's two properties:

```ts
{
  name: string,
  schemaScope: 'admin' | 'tenant',
  licensable: boolean,
  models: RepositoryMap,
  migrations: Migration[],
}
```

A module that owns tables in both scopes registers two descriptors. `core` is
the first case: one admin-scope descriptor for `admin.countries`, one
tenant-scope descriptor for the tenant tables. `schemaScope` stays
single-valued, and selecting modules for a migration run stays a filter over
descriptors.

## Decision — `admin.countries` keys on `char(2)`

`admin.countries` uses its ISO 3166-1 code as the primary key: `code char(2)`,
no `id`, no audit columns. This is the documented exception to the universal
uuid `id` convention in DESIGN.md §2.4. The natural key is the value every
`country_code` column stores and joins on; a surrogate uuid over a fixed
two-letter standard would force a lookup on every FK for nothing.

## Decision — seeds are scripts, not migrations

Seed data (the root tenant, countries, the policy catalog, system roles, the
admin identity) loads through scripts under `src/scripts/`, wired to a `db:seed`
npm script. Migrations carry DDL only.

The two mechanisms have different contracts. A migration runs once per schema
and its content may never change. Seeds are idempotent and re-runnable, read
environment values (`ROOT_EMAIL`, `ROOT_PASSWORD`), and grow as modules land.
Forcing seeds through the tracked-once mechanism would either freeze the data or
fight the checksum verification the migrator requires.

## Decision — CI runs a Postgres service container

DB-backed tests run under plain `npm test`, locally against `DATABASE_URL_TEST`
and in CI against a Postgres service container in the workflow. There is no
mocked-DB test tier: the subjects of this phase — migrations, provisioning,
seeds — are only meaningfully tested against a real database.

## Consequences

- The pg-schemata release gates the phase. Nothing in NAP's migration stack
  lands until the library work ships, and NAP pins the version that carries it.
- Checksum verification makes applied migrations immutable. A correction is a
  new migration, never an edit.
- One module can mean two registry rows. Adding a module still touches exactly
  the registry plus the module's own directory.
- The RULES docs for this territory (`db-and-migrations.md`,
  `tenant-provisioning.md`) land with the code they govern, not with this ADR.

## Alternatives considered

**NAP-side migrator wrapper.** Rejected. Wrapping pg-schemata inside NAP leaves
the library incomplete and hides the parity code from its other consumers.
Owning the library means owning the fix.

**Specifying the migrator's internals here.** Rejected. How pg-schemata stores
tracking rows, sorts dependencies, or shapes its migration context is a decision
for that repository. Duplicating it in NAP creates a second source of truth that
drifts the first time the library changes. This ADR records the dependency and
the boundary; the requirement list above is the contract, not the design.

**`.mjs` migrations with a copy step.** Rejected. A second module system and a
build step that moves files out of the compiler's sight, in exchange for
nothing. `tsc` already emits runnable ESM to `dist/`.

**Per-migration scope inside one descriptor.** Rejected. Tagging each migration
with a scope makes `schemaScope` stop being a module-level fact and pushes scope
filtering down into the migration objects, where every consumer of the registry
has to re-derive it.

**Seeds as migrations.** Rejected. Environment-dependent, re-runnable data in a
mechanism that tracks content-hashed one-shot changes contradicts both sides of
the contract.
