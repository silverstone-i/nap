# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries accumulate under `## [Unreleased]`. Release automation promotes them
when a pull request with a release label merges into `main`.

## [Unreleased]

### Changed

- Merge the feature and workflow PRD categories into one, inter-module workflow (I), for PRDs that own no tables and use several modules' data, whether a user or a background worker starts them. Move them to `docs/PRDs/inter-module-workflows/` and rename F0001 to I0001, F0002 to I0002, and W0001 to I0003, including requirement IDs in docs, code comments, and tests. Plain "workflow" and "feature" keep their English meaning.

## [v0.17.0] - 2026-09-24

### Changed

- Remove row-level security from the `cell` tables, edited in place in baseline migration `001-cell-tenancy`, which no persistent cell has run. Only system code reads and writes these tables, as with `admin` tables; `verifyCell` now requires RLS off. Tenant business tables in the `app` and `reporting` schemas still require RLS (M0002-01-R006).
- Narrow M0002 Cell Tenancy to M0002-01 and M0002-02 and mark it complete. Move the runtime cell registry to workflow PRD W0001 (Draft), and list tenant context, tenant, membership, and entitlement sync, cell-to-admin delivery, cell health, and cell readiness as future workflows and features.
- Sync documentation with the code: PRD statuses, signatures, events, and routes in M0001; runtime-registry references pointing at W0001; the roadmap; and the READMEs and setup guides, which now cover `db:bootstrap`, the `ROOT_*` settings, and the shipped routes and screens.

## [v0.16.0] - 2026-09-24

### Added

- Add the cell database foundation (M0002-01): the `cell-tenancy` module with five `cell` tables in baseline migration `001-cell-tenancy`, a cell module registry kept apart from the admin registry, and `migrateCell`, which migrates one cell database and checks its tables, grants, and row-level security. Nothing calls `migrateCell` yet; cell provisioning will.
- Add the physical identity check (M0002-02): `verifyPhysicalIdentity`, which compares a cell's `cell.physical_identity` row against its `admin.cells` record and `current_database()` before the cell is trusted to serve tenant traffic. Nothing calls it yet; the runtime cell registry will.

### Changed

- Add the M0002 Cell Tenancy overview with its ten Work Units and status table, and number new modules' Work Units from `-01` (M0001 keeps `-00`).
- Narrow M0001-05 to root authority and mark it Complete, moving role seeds, assignments, non-root resolution, and wildcard capability matching to a draft M0569 PRD. Renumber the root-authority requirement to M0001-05-R001, mark Admin Tenancy complete in the roadmap, point deferred-role references in PRDs and code comments at M0569, and record that the roadmap is a checklist and each PRD must be one atomic unit.
- Remove PRDs whose implementation has not started from the repository, and rewrite implemented PRDs and code comments so they no longer reference them. Clear PRD names from roadmap rows that have not started, and mark Access Control Not started instead of Blocked. Correct the `portal_users.status` documentation: failed-login throttling does not change `status`, and `locked` is reserved for a future operator-cleared lock.

## [v0.15.3] - 2026-09-23

### Added

- Add the `admin.outbox` table, edited in place in baseline migration `001-admin-tenancy`, where tenant, membership, and entitlement changes wait for delivery to their cell. Before migrating, run `apps/api/src/scripts/sql/001-admin-tenancy-outbox.sql` as `nap-admin` against each existing admin database, after `001-admin-tenancy-support-grants.sql`. Recreate disposable databases instead.

### Changed

- Add Portal Access to the roadmap after Business Directory; later roadmap orders shift by one.

## [v0.15.2] - 2026-09-23

### Added

- Add the `admin.support_grants` table and a `break_glass` session access mode, edited in place in baseline migration `001-admin-tenancy`, recording support requests to act as a tenant member and the member's or `tenant_admin`'s decision. Before migrating, run `apps/api/src/scripts/sql/001-admin-tenancy-support-grants.sql` as `nap-admin` against each existing admin database, after `001-admin-tenancy-vendor-contact.sql`. Recreate disposable databases instead.

## [v0.15.1] - 2026-09-22

### Changed

- Rename the membership and provisioning-job member type `vendor` to `vendor_contact`, edited in place in baseline migration `001-admin-tenancy`. Before migrating, run `apps/api/src/scripts/sql/001-admin-tenancy-vendor-contact.sql` as `nap-admin` against each existing admin database: it rewrites both check constraints and existing rows and updates the migration ledger hash. Recreate disposable databases instead.

## [v0.15.0] - 2026-09-22

### Added

- Add platform administration screens under Tenant Management: Tenants (create-only), Cells (register, retry failed provisioning, disable), and Portal Users (create, deactivate, restore — with the root account shown read-only). Backed by two new cursor-paginated endpoints, `GET /api/admin-tenancy/v1/tenants` and `GET /api/admin-tenancy/v1/accounts/users`.

### Fixed

- Fix `ContextualActionHeader` layout props being dropped, and `PageHeaderContext` re-rendering consumers on every title change.

## [v0.14.0] - 2026-09-22

### Added

- Add the browser application shell: login with throttling and required password change, session restoration, protected routes, tenant selection and switching, platform and tenant Home areas, responsive navigation with contextual actions, and a light/dark display-mode toggle. A new `GET /api/admin-tenancy/v1/access/context` endpoint gives the browser one authoritative startup read of the session, selected tenant, and the per-destination `entryPoints` — including the Tenant Management navigation gate — used to route a signed-in user.

## [v0.13.0] - 2026-09-21

### Changed

- Reconcile the M0001-06, M0001-08, and M0001-09 Work Unit PRDs and the Admin Tenancy family roadmap: mark all three `Implemented`/`Complete` with fresh verification evidence, matching code and tests already merged.
- Add `npm run test:db:local`, which provisions a disposable local PostgreSQL 18 cluster, runs `test:db`'s integration tests against it, and tears the cluster down afterward — you no longer need to manually stand up a fixture server to run them locally.

## [v0.12.0] - 2026-09-21

### Added

- Add tenant selection and support access under `/api/admin-tenancy/v1/access`: list a portal user's own eligible tenants, select one for normal work, and enter or exit a time-limited, attributed support context on another tenant. Selection and entry each rotate the session token; a support session's 60-minute access window is enforced automatically, downgrading and rotating the token on the next request once it passes. Support entry is denied without exposing tenant data when the target is the Napsoft tenant.
- Add module entitlement read, grant, and withdrawal under `/api/admin-tenancy/v1/tenants/:tenant/entitlements`: read the full optional-module catalogue with each module's effective state and revision, and grant or withdraw one module idempotently — repeating the current state returns it unchanged, and withdrawing an already-disabled or never-granted module never creates a row. Concurrent changes to the same tenant and module serialize to one committed result, and each change records an administrative event and advances the tenant's entitlement cache revision.

## [v0.11.0] - 2026-09-21

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
