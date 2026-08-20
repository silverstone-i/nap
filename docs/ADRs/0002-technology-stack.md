# 0002 — Technology stack

- **Status:** Accepted
- **Date:** 2026-08-19
- **Requirements:** `ARCH-001`–`ARCH-004`, `ARCH-024`, `ARCH-029`–`ARCH-031`, `ARCH-036`

## Context

NAP needs one supported runtime, database, server framework, browser stack,
module system, and test toolchain. These choices must support the modular
monolith, independent web/API releases, multiple database handles, strict
tenant isolation, and an open-source self-hosted distribution.

Exact dependency versions change more frequently than architectural choices.
This ADR records the selected technologies and compatibility constraints;
package manifests, the lockfile, `.nvmrc`, and TypeScript configuration record
the exact installed versions.

## Decision

### Repository and runtime

- Use an npm-workspace monorepo.
- Use Node.js 24 as the server and tooling runtime, pinned by `.nvmrc`.
- Use ES modules throughout (`"type": "module"`).
- Use TypeScript in strict mode, pinned to the supported 6.0 release line until
  the lint toolchain supports a later compiler.

### API

- Use Express 5 on Node.js for the modular-monolith HTTP API.
- Compile API TypeScript with `tsc`, NodeNext module resolution, ES2023 target,
  and `.js` suffixes on relative source imports.
- Use `pg-schemata` as the owned PostgreSQL data-access and migration library.
- Use signed JWTs in httpOnly cookies for client session tokens; current
  session and authorization state remains database-authoritative under PRD 0000.

### Database and storage

- Use PostgreSQL 18 for central administration and tenant-cell databases.
- Use ordinary PostgreSQL constraints and forced RLS as decided by ADR 0004;
  do not introduce a second ORM abstraction over `pg-schemata`.
- Redis is optional infrastructure for derived caches or coordination. The
  platform must operate correctly without it.
- Store binary documents in provider-neutral object storage. PostgreSQL stores
  their metadata and ownership.

### Web

- Use React 19 and MUI Material/MUI X 9 for the authenticated web client.
- Use a client-rendered SPA. Vite, browser TypeScript resolution, and the exact
  web build behavior are decided by ADR 0003.

### Tests and quality

- Use Vitest for unit and integration tests.
- Use Supertest for HTTP integration tests.
- Use ESLint flat configuration with `typescript-eslint` and Prettier for
  formatting.
- Root scripts fan lint, typecheck, test, and build checks out to workspaces.

### Deployment targets

- Deploy the static web build independently through Vercel.
- Deploy the Node API through Render.
- Use managed PostgreSQL independently of API deployments.
- Keep provider-specific configuration at deployment boundaries so self-hosted
  installations can supply equivalent Node, PostgreSQL, object-storage, and
  static-hosting infrastructure.

## Version authority

- `package.json` and the lockfile are authoritative for package versions.
- `.nvmrc` is authoritative for the Node runtime version.
- TypeScript configuration files are authoritative for compiler behavior.
- This ADR must be amended only when a technology choice or compatibility
  boundary changes, not for ordinary patch upgrades.

## Consequences

- API and web code use different TypeScript resolution modes because one is
  executed by Node and the other is bundled for the browser.
- Contributors use one root toolchain and do not install independent TypeScript
  versions inside workspaces.
- PostgreSQL remains the only durable relational and authorization source of
  truth.
- Redis outages may reduce performance but cannot expand access or make
  authorization impossible.
- Managed and self-hosted deployments share application code while using
  different provider configuration.

## Alternatives considered

**Separate repositories for web and API.** Rejected. A workspace monorepo
supports coordinated contracts and testing without coupling deployment units.

**Next.js or another server-rendered web framework.** Rejected for the initial
authenticated ERP client; ADR 0003 records the browser-toolchain decision.

**A second ORM over PostgreSQL.** Rejected. It would obscure the RLS,
transaction, constraint, and migration behavior NAP must control directly.

**Redis as a required session or permission store.** Rejected. Ephemeral cache
availability must not define security correctness.

**Bundling PostgreSQL with the API deployment.** Rejected. It would couple data
recovery to application lifecycle in conflict with `ARCH-036`.
