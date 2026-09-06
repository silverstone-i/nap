# Database and migration foundation implementation plan

## Outcome and design

Implements the [roadmap capability](../roadmaps/DEVELOPMENT-ROADMAP.md#database-and-migration-foundation)
and the [specification](../specs/nap-platform-specification.md):
`ARCH-004`–`ARCH-010`, `ARCH-019`, `ARCH-024`–`ARCH-026`, `ARCH-036`,
`ARCH-047`, and `ARCH-049`. No component PRD is required.

Deliver independently typed and closable admin/cell pg-schemata handles,
explicit migration commands, and runtime privilege checks before listening.
The existing setup script remains development/test provisioning only.

## Work and PR sequence

One implementation PR is the intended review unit; committing, pushing, and
opening it require a separate explicit request. Its changes contain this delivery record, the ADR 0002 filename
clarification, configuration and composition roots, role checks and server
lifecycle, module descriptors and migration runners, tests, and documentation.

- Resolve environment-specific runtime and migration URLs only in util/env.ts.
  Runtime needs no migration credentials; each release command needs only its
  selected migration URL. Preserve supported driver connection options and
  inherited environment precedence; never print connection settings.
- Create independent typed handles using pg-schemata directly, with a five-second
  connection timeout. Close handles on startup failure, listen failure, and shutdown.
- Reject unsafe role flags, ownership, and transitive privileged memberships.
  Fail closed if the checks cannot complete; introduce no health endpoints.
- Validate target/schema descriptors and duplicate names before opening a handle.
  Initialize admin and all four cell schemas with library-owned tracking tables,
  even with empty registries. Execute cell, reference, app, reporting in that order.
  Use library ordering, transactions, locks, and checksums without an ORM wrapper.
- Keep production registries empty. Add no business tables, tenant transactions,
  RLS implementation, blanket grants, bootstrap data, or operational endpoints.

## Tests and evidence

Test configuration, nominal handle types, descriptor validation, and ordering.
Use disposable PostgreSQL 18 databases and roles for independent pool lifecycle,
role flags and direct/transitive ownership paths, compiled API startup/shutdown,
explicit CLI targets, repeat migration runs, checksum rejection, transaction
rollback, partial cell completion and retry, fresh/upgrade schema equivalence,
and independent dump/restore. Missing prerequisites fail tests rather than skip.
Run narrow tests first, then lint, format:check, typecheck, test, build, and
licenses locally and in CI. The roadmap owns status; GitHub owns CI/merge evidence.

## Rollout, risks, and recovery

Provision production databases and owner roles externally. Run admin and cell
migration commands before deploying the API with runtime credentials only.
This release creates canonical schemas and migration tracking, not business data.

Transactions are per schema: earlier schemas remain committed if a later one
fails. Correct the cause and rerun; never edit an applied migration. Application
rollback leaves schemas and tracking intact and never drops databases or roles.
Connection availability, unsafe existing roles, and PostgreSQL tooling can block
verification; do not weaken checks to bypass them. Tenant isolation and the
operational baseline remain subsequent roadmap capabilities.
