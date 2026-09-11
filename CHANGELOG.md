# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries accumulate under `## [Unreleased]`. CI promotes that heading to a new
version when a pull request carrying a `release:patch`, `release:minor`, or
`release:major` label merges into `main`; do not promote it by hand.

## [Unreleased]

### Added

- Add the responsive product shell, Dashboard navigation, tenant and portal-user
  provisioning screens, and bounded Employees view with controlled-access recovery.

### Changed

- Focus tenant and portal-user management around feature toolbars, MUI X DataGrid
  lists, record actions, and collapsible Tenant Management navigation with flyouts.

- Consolidate account controls in an initial-avatar menu with Profile and Settings
  placeholders, and provide a dedicated password-change page with confirmation.
- Require tenant selection after every vendor login, preserve safe tenant deep
  links, and clear stale responses when session or access context changes.
- Accept PRD 0009, ADR 0010, linked specification/PRD amendments, and deferred
  settings registers with the shell implementation.

## [v0.14.0] - 2026-09-09

### Added

- Add revision-checked Redis acceleration for authorization with PostgreSQL fallback.

- Add separate admin and cell database reset commands with explicit confirmation,
  transactional schema removal, and migration replay verification.

### Fixed

- Forward local web `/api` requests to the API so the login page receives session
  JSON instead of the Vite HTML fallback.

### Changed

- Compose database row types from shared audit and soft-delete fields, keeping
  table-specific fields first without changing schemas or migration history.

## [v0.13.0] - 2026-09-09

### Changed

- Add scoped multi-role authorization, shared support policy, explicit module
  entitlements, company/project and access-administration screens, and reviewed
  tenant transition with fail-closed readiness and replay-safe role templates.

- Isolate CI and release PostgreSQL client installation from unrelated runner
  APT repositories while retaining package integrity checks.

## [v0.12.0] - 2026-09-09

### Added

- Shared-origin routing mode, cross-cell tenant selection and operator provisioning,
  with independent database credentials and recoverable two-cell acceptance tests.

### Fixed

- Verify current cell projections and linked records before tenant activation, and
  recover activation after a cell commit survives a failed central transaction.

### Changed

- Share project-local shipping guidance across Codex and Claude, including capability verification before merge.

## [v0.11.0] - 2026-09-08

### Added

- Tenant membership selection, central platform grants, audited controlled access,
  minimal Core identity records, and recoverable one-cell provisioning with operator web flows.

### Changed

- Extend authentication with mandatory initial password change and restricted selection sessions.
- Reconcile Authentication and sessions verification against merged PR #14 and passing checks.

### Fixed

- Clear rejected-session audit attribution, distinguish retry input errors from cell failures,
  and preserve safe login destinations across session updates.

## [v0.10.0] - 2026-09-08

### Changed

- Update pg-schemata to 3.1.1 and use explicit expression indexes for case-insensitive email uniqueness.

### Added

- Authentication tables, root bootstrap/recovery, signed database-backed sessions,
  login throttling, password changes, and login/account web flows (PRD 0003).
- The narrowly scoped anonymous throttle audit-actor exception (ADR 0005).

## [v0.9.0] - 2026-09-08

### Added

- Design Authentication and sessions: PRD 0003, ADR 0004 for the seeded root
  identity, the `ARCH-040` and framework HTTP contract amendments, and the
  change-workflow rule that an amendment lands with the code it changes.
- Framework support for admin-bound routers, declared `anonymous` and
  `authenticated` extension-route access on the `admin-tenancy` auth router,
  cookie and client-address controls for extension operations, and the
  `TRUST_PROXY_HOPS` setting.

## [v0.8.0] - 2026-09-07

### Changed

- Enforce release labels, Unreleased notes, and CI-owned versions; select pending
  releases by Git ancestry and publish version commits and tags atomically.
- Recover missing GitHub Releases without another version bump, and document
  release operations with tests for publication and license-check failures.

- Mark the operational baseline, shared transport package, framework HTTP
  surface, and brand, theme, and web entry surface capabilities Verified, with
  tests for the request completion log record, faults after headers commit,
  the shared package import boundary, and web brand discipline.

## [v0.7.0] - 2026-09-07

### Added

- Add the branded web entry page, shared MUI theme and wordmark, persistent
  System/Light/Dark selection, lazy-route loading and recovery, and favicon assets.

## [v0.6.0] - 2026-09-07

### Added

- Add the framework HTTP surface: read and write controllers, the router
  factory with the standard route set, per-route disabling, and the extension
  callback, session and permission gates, tenant-input rejection, keyset list
  parameters, all-or-nothing batch writes, in-memory spreadsheet import and
  export, and the route registry composition root.

### Changed

- Add `UNAUTHENTICATED`, `FORBIDDEN`, and `CONFLICT` to the shared error-code
  registry, name the spreadsheet library in the technology stack, and give the
  runtime named admin and cell database handles.

## [v0.5.0] - 2026-09-07

### Added

- Add shared success and list response envelopes with page metadata,
  request-body and response-contract validation in the API, and a validating
  web API client that keeps the request identifier.

### Changed

- Adopt a code documentation convention for function, type, and constant
  comments, and rewrite the existing API and web source comments to it.

## [v0.4.0] - 2026-09-06

### Added

- Add API liveness and readiness probes with fresh database role checks,
  request correlation, and safe structured logging.

### Changed

- Return versioned JSON errors for unknown routes and invalid requests, with
  bounded JSON bodies and refusal of compressed request payloads.
- Drain active HTTP requests before closing database pools during shutdown,
  with bounded cleanup and unsuccessful exits when deadlines are exceeded.

## [v0.3.0] - 2026-09-06

### Added

- Add tenant-scoped database transactions and isolation verification covering
  cross-tenant access, relational integrity, reporting, and pooled connections.

### Changed

- Adopt shared JavaScript-first TypeScript coding conventions and lint enforcement,
  and simplify API and test code while preserving behavior.

## [v0.2.0] - 2026-09-06

### Added

- Add independent admin and cell database handles, explicit schema migration
  commands, and startup rejection of unsafe runtime roles.

### Changed

- Use Node's built-in environment loader for API startup and database setup, and
  clarify function purpose and rationale in contributor guidance and code comments.

### Fixed

- Avoid forced connection termination during migration-test cleanup and report
  database pool shutdown failures.

- Report environment-file permission failures instead of treating inaccessible
  files as missing optional configuration.

## [v0.1.0] - 2026-09-06

### Added

- Buildable API, web, and shared workspaces with development startup, automated
  toolchain checks, production license validation, and safe development/test
  database setup.
- API startup logs display the listening port.
