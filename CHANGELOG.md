# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries accumulate under `## [Unreleased]`. CI promotes that heading to a new
version when a pull request carrying a `release:patch`, `release:minor`, or
`release:major` label merges into `main`; do not promote it by hand.

## [Unreleased]

### Added

- Committed VS Code configuration in `.vscode/`: extension recommendations,
  workspace settings pinning the editor to the repository TypeScript and
  formatting on save with Prettier, and launch configurations for the API
  server and both test suites.

### Changed

- `apps/api` build output now includes source maps so breakpoints bind to the
  TypeScript sources.

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
