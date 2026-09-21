# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries accumulate under `## [Unreleased]`. Release automation promotes them
when a pull request with a release label merges into `main`.

## [Unreleased]

### Added

- Add ordinary portal-user and tenant-membership administration under `/api/admin-tenancy/v1/accounts`: create-or-reuse, read, update, archive, and restore a portal user; create a membership with its queued provisioning job, suspend, reactivate, archive, and restore a membership; read and retry a provisioning job. Disabling or archiving a user revokes every session it holds, and suspending or archiving a membership revokes only sessions that selected its tenant. A required `Idempotency-Key` on both create routes makes a repeated or concurrent request return the original result instead of creating a duplicate.

## [v0.10.0] - 2026-09-21

### Added

- Add cell registration, retry, and disable, plus an operator overview and per-cell readiness read, under `/api/admin-tenancy/v1/control`. Registration only records intent — it never creates a physical database inside the request — and support cannot retry or disable a cell holding the Napsoft tenant.
- Add central tenant creation under `POST /api/admin-tenancy/v1/tenants`. Creation reports the new tenant as pending, unassigned, and unprovisioned; a required `Idempotency-Key` makes a repeated or concurrent request return the original tenant instead of creating a duplicate, and only `db:bootstrap` can ever designate the owning Napsoft tenant.

## [v0.9.0] - 2026-09-20

### Added

- Allow an unrestricted root session to revoke another user's session using the built-in root capability set.

## [v0.8.0] - 2026-09-20

### Added

- Add the `db:bootstrap` maintenance command to create or verify the owning Napsoft tenant, root portal user, and root membership, idempotently and safely under concurrent execution. The root account starts active with no forced password change, since root authority comes directly from `is_root` rather than a role assignment.

### Changed

- Define root authority as the built-in `platform_admin` capability set derived from `is_root`, without a role assignment or cell-role seed dependency.

## [v0.7.0] - 2026-09-20

### Added

- Add Admin login with password verification, per-account and per-client-address throttling after five failed attempts in fifteen minutes, and required temporary-password replacement that revokes every other session.

### Changed

- Require `AUTH_THROTTLE_SECRET_<ENV>` at API startup, alongside `ARGON2_MEMORY_KIB`, `ARGON2_TIME_COST`, and `ARGON2_PARALLELISM` floors for password hashing.

## [v0.6.0] - 2026-09-20

### Added

- Add Admin browser sessions with opaque tokens, idle and absolute expiry, rotation, revocation, and the BFF request chain that serves them.

### Changed

- Require `SESSION_SECRET_<ENV>` and `APP_ORIGIN_<ENV>` at API startup, and reject `SameSite=None` or insecure production session cookies.

## [v0.5.0] - 2026-09-20

### Added

- Add an append-only Admin event history with a validated catalogue, transactional append, and authorized, filtered, paginated reads.

## [v0.4.0] - 2026-09-19

### Added

- Add PostgreSQL revision vectors and optional Redis validation for consistent Admin authorization caches.

## [v0.3.0] - 2026-09-19

### Added

- Add scoped Admin tenant, portal-user, credential, and membership reads with safe field selection and stable pagination.

## [v0.2.0] - 2026-09-19

### Added

- Set up and migrate the Admin database locally and on Render, with schema verification and retry recovery.
- Serve the built web client through the BFF and check Admin database readiness before accepting requests.

### Changed

- Define the Admin Tenancy PRD work units, database schema contracts, and tenant role seeding; refine PRD authoring guidance.
- Document workspace responsibilities, database setup, and runtime configuration; add PostgreSQL integration tests to CI.

## [v0.1.0] - 2026-09-17

### Fixed

- Allow the first automated release without a pre-existing version tag and
  prevent unlabeled merges from publishing pending releases.

### Changed

- Document the BFF, admin/cell architecture, migration strategy, and module boundaries.
- Add PRD authoring guidance and a reusable requirements template.
- Add the NAP brand reference, visual specimens, and favicon assets.
- Add the development roadmap and CI validation for declared progress updates
  and completion evidence; unrelated PRs require no roadmap update.
