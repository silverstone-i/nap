# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Authentication and session management (PRD 0004): email + password login
  with argon2id hashing and opportunistic rehash, a 15-minute access JWT and
  rotating opaque refresh token in httpOnly cookies, Postgres-backed sessions
  with sliding idle expiry and an admin-owned absolute lifetime,
  rotation-reuse revocation, tenant switching, password change that revokes
  other sessions, and a per-user idle-window preference — six routes under
  `/api/auth/v1`.
- `admin.sessions` table plus session-policy columns on `admin.tenants` and
  `admin.portal_users`, delivered to existing databases by the first
  module-scoped migrations.

- Express 5 API server shell: `GET /health`, JSON 404 and error handlers, and
  a fixed startup order that probes Postgres before listening, with graceful
  shutdown on SIGINT/SIGTERM.
- Database layer over the owned pg-schemata library: connection singleton,
  module registry with schema-scope filtering, and repository-map collection
  ready for the first module's models and migrations.
- Database migrator with three registry-fed entry points: `migrateAdmin()`,
  `migrateTenant(schemaName)`, and `migrateAllTenants()` — scope filtering
  via the registry, sequential per-tenant runs that continue past failures,
  and a per-schema report that fails the calling script when any schema
  fails.
- Leveled console logger shared by the server and repositories.
- Vite 8 + React 19 web client serving the branded NAP landing page.
- Monorepo toolchain: npm workspaces, shared strict TypeScript base config,
  ESLint 10 flat config with Prettier 3, husky DCO commit hook, Vitest suites
  in both workspaces, and GitHub Actions CI and release workflows.
- Web app shell (PRD 0001): navigation rail, top bar, entity and project
  switchers with URL-driven scope, user menu, and a light/dark theme that
  follows the system preference with a per-device override.
- Mock-data walkthrough pages: inbox, projects list and detail, and an
  invoices list with a preview drawer — all served from typed mock selectors
  that a future API client replaces module by module.

### Changed

- Web app is served from the root path (`/`) instead of the `/nap/` base path.
