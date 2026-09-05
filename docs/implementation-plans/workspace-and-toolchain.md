# Workspace and toolchain implementation plan

## Work checklist

- [x] Lock declared dependencies and verify a clean install.
- [x] Complete workspace compiler configurations and package boundaries.
- [x] Add minimal API, web, and shared entry points.
- [x] Add workspace tests, import checks, and license checking.
- [x] Provision development/test databases for the existing CI gate.
- [x] Verify independent builds, startup, and repository checks.
- [x] Reconcile CI evidence and deliver one PR.

Local verification passed: clean installation, independent builds, repository
checks, browser rendering and hot reload, API watch restart, and disposable
PostgreSQL setup tests. [PR #1](https://github.com/silverstone-i/nap/pull/1)
contains the implementation; [CI passed](https://github.com/silverstone-i/nap/actions/runs/33993431984).
Merge remains a separate operation.

## Design and outcome

Implements the [specification](../specs/nap-platform-specification.md),
`ARCH-001`–`ARCH-003` and `ARCH-051`, and the first
[roadmap capability](../roadmaps/DEVELOPMENT-ROADMAP.md#workspace-and-toolchain).
This is specification-owned toolchain work with no owning component PRD; the
plan therefore uses the capability name without a PRD number.

Complete the existing configuration skeleton so each workspace builds and both
applications start independently. Preserve the declared stack and public package
entry points. The shared package initially exports no contracts. The API returns
empty 404 responses; the web renders an accessible NAP heading.

## Delivery and boundaries

One implementation PR includes strict TypeScript configurations, Vitest tests,
ESLint coverage, a reproducible lockfile, license checking, and non-destructive
PostgreSQL development/test provisioning required by CI. Connection settings are
resolved by API util/env.ts; setup never prints credentials, resets passwords,
or drops existing databases. Reject incompatible targets, ownership, or roles.

Migrations, tables, RLS, production provisioning, HTTP framework contracts,
authentication, branding, and product navigation are later capabilities.

## Tests and evidence

Verify clean installation; isolated workspace builds; API startup, empty 404,
invalid port and shutdown; React rendering and Vite reload; shared package
resolution and forbidden imports; license acceptance/rejection; fresh and repeated
database setup and invalid configuration/unsafe-role rejection. Run lint,
format:check, typecheck, test, build, and licenses locally and in CI. GitHub owns
CI evidence and the roadmap owns implementation status.

## Risks and recovery

Dependency compatibility, native dependency installation, PostgreSQL client
availability, and existing role privileges can block verification. Report actual
failures without weakening gates. Deliver no application schema or data migration.
Recovery is a code revert; provisioned roles/databases are never deleted by setup.
