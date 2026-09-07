# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries accumulate under `## [Unreleased]`. CI promotes that heading to a new
version when a pull request carrying a `release:patch`, `release:minor`, or
`release:major` label merges into `main`; do not promote it by hand.

## [Unreleased]

### Changed

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
