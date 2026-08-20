# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries accumulate under `## [Unreleased]`. CI promotes that heading to a new
version when a pull request carrying a `release:patch`, `release:minor`, or
`release:major` label merges into `main`; do not promote it by hand.

## [Unreleased]

### Added

- Database and isolation foundation (roadmap Phase 1): separate `admin` and
  `cell` composition roots built on the `pg-schemata` factory, each with its
  own pool, repository registry, migration registry, and `close()`.
- `withTenantTransaction()`, the single entry point for tenant-owned queries.
  It validates the tenant identifier, then sets `nap.tenant_id` for the life
  of one transaction.
- `migrateAdmin()` and `migrateCell()` release runners plus
  `npm run db:migrate:admin` / `db:migrate:cell`. Each requires an explicit
  target; startup never migrates.
- A startup check that refuses to serve traffic on a database connection that
  owns tenant tables or can bypass row-level security.
- The shared tenant-isolation test harness and the `cell.isolation_probe`
  fixture that proves forced RLS, tenant-inclusive keys, composite foreign
  keys, runtime-role restrictions, and the no-context and invalid-context
  cases.
- `npm run db:setup:dev` and `db:setup:test`, which create the admin and cell
  databases and the least-privileged runtime role.

### Changed

- `apps/api/.env.example` now describes one connection string per database and
  role. `DATABASE_URL_DEV`, `DATABASE_URL_TEST`, and `DATABASE_URL_PROD` are
  replaced by `ADMIN_`/`CELL_` `DATABASE_URL_*` and `MIGRATION_URL_*`.
- CI and the release workflow provision an admin database, a cell database,
  and the runtime role before running the tests.

## [v0.1.0] - 2026-08-20

### Added

- Architecture documentation baseline: PRD 0000, ADRs 0001-0004 and their
  index, RULES for database access, PRD format, and the web shell,
  `PROJECT-STRUCTURE.md`, the development roadmap, and the initial table
  schema reference.
- npm workspace monorepo with `apps/api`, `apps/web`, and `packages/shared`,
  the root TypeScript, ESLint, and Prettier toolchain, and `.nvmrc` pinning
  Node 24.
- Minimal API and web shells proving the Phase 0 gate: an Express `GET /health`
  route and a React entry point, each with a smoke test.
- CI, changelog-check, and release-on-merge workflows, a husky `commit-msg`
  hook enforcing DCO sign-off, and a production-dependency license check
  against `.licenses-allowed.json`.
- Development loops for both apps: `npm run dev:api` rebuilds and restarts the
  API on change, and `npm run dev:web` serves the web app on port 5180 with a
  `/api` proxy.
