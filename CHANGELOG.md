# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries accumulate under `## [Unreleased]`. CI promotes that heading to a new
version when a pull request carrying a `release:patch`, `release:minor`, or
`release:major` label merges into `main`; do not promote it by hand.

## [Unreleased]

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
