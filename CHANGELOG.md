# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries accumulate under `## [Unreleased]`. Release automation promotes them
when a pull request with a release label merges into `main`.

## [Unreleased]

## [v0.27.0] - 2026-10-01

### Added

- Portal access (I0008). Turning **Portal access** on for an employee, contact, or (after it has an email) a vendor or client contact sends a request that creates or reuses the person's login and membership; it takes a temporary password, which the person must replace at first sign-in. Turning access off or archiving the person suspends the membership and signs them out of that tenant. Directory lists and records show each person's status (Off, Requested, Invited, On, Failed) with the reason for a failure, and **Retry** resends a failed request (`POST /{collection}/:id/portal-access/retry`).
- Replacing a temporary password activates every pending membership of that login, so the person can select the tenant straight away.
- Napsoft login recovery on Portal Users: **Memberships** (`GET /accounts/users/:id/memberships`), **Reset password** (`POST /accounts/users/:id/password-reset`, which signs the login out everywhere), **Unlock** (`POST /accounts/users/:id/unlock`, which clears the sign-in throttle), and **Disable**/**Enable**. All refuse the initial Napsoft login with `ROOT_IMMUTABLE`.

### Changed

- Turning off portal access for, or archiving, a person who holds `tenant_admin` (or `platform_admin` in Napsoft) fails with `ADMIN_ASSIGNED`, and a user cannot turn off their own access or archive themselves (`INVALID_STATE`).
- A portal user's primary email cannot be added, edited, replaced, or removed while their access is on (`INVALID_STATE`).
- Vendor and client contacts can no longer be created with portal access on; turn it on by editing the contact once it has a primary email.
- Person and contact responses include `portalAccess: { status, failureCode }`.

## [v0.26.1] - 2026-10-01

### Fixed

- The Tenants screen's row menu shows an icon for each action: a handshake for **View client** (as on Directory → Clients) and a refresh arrow for **Retry**, instead of the generic ⋮.

## [v0.26.0] - 2026-10-01

### Added

- New tenants are provisioned from a client record in the Napsoft tenant's Directory: **Provision tenant** on the client takes the code, name, tier, a ready cell, and the first administrator (pickable from the client's contacts). `tenant-provision` now takes `client`, `code`, `name`, and `tier`, creates the tenant and queues its job in one request, and rejects an unknown client (`404`), a client or code already used (`409`), or an unready cell (`503`). `admin.tenants` gains `client_id`, unique among active tenants.
- The Tenants screen offers **View client**, which opens the tenant's Napsoft client record. `GET /tenants?clientId=` returns a client's tenant. A client's contact list shows each contact's primary email and phone and its Primary and Billing contact flags.

### Removed

- `POST /api/admin-tenancy/v1/tenants` and the Tenants screen's **Create tenant** and **Provision** actions.
- Tenant self-designated contacts: the Settings → Tenant Contacts page, the `/tenant-contacts` routes, the `business-directory::tenant-contacts::write` capability, the `directory.tenant_contact.*` events, and the `LAST_PRIMARY_CONTACT` and `NOT_EMPLOYEE` errors. Provisioning no longer flags the first administrator as primary contact.

### Changed

- `is_primary_contact` and `is_billing_contact` now apply only to vendor and client contacts; the database rejects them on a person with no organization.
- The `admin-tenancy` and `business-directory` migrations are edited in place, so recreate existing databases.

## [v0.25.1] - 2026-10-01

### Changed

- Business directory schema: `app.organization_contacts` and `app.tenant_contacts` are gone. Vendor and client contacts are `app.people` rows with an `organization_id`, and use first and last name instead of a full name. A tenant contact is an employee flagged `is_primary_contact` or `is_billing_contact`. An organization contact can carry the same two flags, as its organization's primary or billing contact. Tax IDs move from each record table to `app.parties`, and the database now rejects a tax ID on a vendor contact. The `/organization-contacts` and `/tenant-contacts` routes and `directory.tenant_contact.*` events keep their shape, except contacts take `firstName`/`lastName` in place of `fullName` and add `isPrimaryContact`/`isBillingContact`.
- A duplicate tax ID warning now covers every active record, not just records of the same kind.
- Designating or removing a tenant contact advances that employee's `revision`.
- The `business-directory` migration is edited in place, so recreate existing cell databases.

## [v0.25.0] - 2026-09-30

### Changed

- The web app's **Organization Setup** nav group is now **Directory** (Employees, Contacts, Vendors, Clients). Docs: the module map splits the product area into Directory (`business-directory`) and Settings (`reference-data`, `companies`, `access-control`, `tenant-settings`), and roadmap Phase 3 is now "Directory and Settings".

## [v0.24.1] - 2026-09-30

### Changed

- Web navigation: **Organization Setup** now lists one page per record kind (Employees, Contacts, Vendors, Clients) in place of People and Vendors & Clients, with no kind filter or kind picker. A new **Settings** group holds Roles, Tenant Contacts, and Labels; Roles leaves Tenant Management. Routes move to `/directory/{employees,contacts,vendors,clients}` and `/settings/{roles,tenant-contacts,labels}`; the old paths redirect to the root.

## [v0.24.0] - 2026-09-29

### Added

- Business directory (M0005): employees, contacts, vendors, clients, and their contacts, each with emails, phones, and addresses under tenant-defined labels, plus the tenant's primary and billing contacts. Routes are under `/api/business-directory/v1`, and the web app adds an **Organization Setup** group (People, Vendors & Clients, Tenant Contacts, Labels). A home buyer client takes its primary tax ID from one flagged buyer. The last primary tenant contact cannot be removed.
- Tax IDs are encrypted with AES-256-GCM and stored with a keyed hash for search and the last four digits for display. Reading a full tax ID needs `business-directory::tax-ids::read` and is recorded; setting one needs `business-directory::tax-ids::write`. The API now requires `TAX_ID_ENCRYPTION_KEY_<ENV>` (base64 of 32 bytes) and `TAX_ID_HASH_KEY_<ENV>` (at least 32 characters, different from other secrets) and will not start without them. Neither key rotates, so keep both safe.
- Directory changes reach admin as `directory.*` administrative events through the cell outbox; tax IDs appear only as their last four digits.
- Provisioning a tenant now asks for the first administrator's first and last name and creates them as an employee, with their login email as primary email, as the tenant's first primary contact, and with the default labels. Napsoft setup seeds the default labels; the root login keeps no employee record.

### Changed

- `business-directory` is a foundation module: every tenant can use it, and it is no longer an optional entitlement.
- Member type `client` is now `client_contact`, since a client's portal user is its buyer or contact. An active, ready membership with a member type must have a `member_id`.
- The `app` schema verifier checks every `app` module's tables, not only access control's.
- The admin, cell-tenancy, and new business-directory migrations are edited in place, so recreate existing databases.
- Docs: M0005 is Implemented; roadmap item 13 is Complete; I0003, I0004, I0006, M0001-00-01, M0001-08, M0001-10, and M0002-01 are updated to match.

## [v0.23.0] - 2026-09-29

### Added

- Reference-data rollout (I0007): operators can load a new reference seed version into existing cells from the Cells screen (**Roll out reference data** for all cells, **Load reference data** for one), see per-cell seed state and counts, and retry failures. `npm run db:seed:rollout -- --env <env>` does the same without the API, for when the Napsoft cell itself is missing the seed.
- Admin migration `002-cell-seed-action` allows `seed` provisioning jobs. Run `npm run db:migrate:admin` before starting the API.

### Changed

- A failed `seed` job disables its cell, like other failed provisioning jobs.
- Docs: I0007 is Implemented; roadmap item 12 is Complete; `migrations.md` links the rollout.

### Fixed

- Retrying a failed `activate` job now starts it; before, the worker rejected it with `INVALID_STATE`.

## [v0.22.0] - 2026-09-29

### Added

- Reference data (M0004): each new cell is seeded with ISO 3166-1 countries and ISO 4217 currencies; a cell missing the seed version is not ready (`SEED_MISSING`); `GET /api/reference-data/v1/countries` and `/currencies`; country and currency lookup controls in the web app.

### Changed

- Docs: M0004 is Implemented; roadmap item 11 is Complete.

### Fixed

- After a required password change, the web app now leaves the Change password page for the user's destination instead of showing the empty form again (I0001-R002).

## [v0.21.1] - 2026-09-29

### Fixed

- A tenant administrator can now read their own tenant's module entitlements (`GET /tenants/:tenant/entitlements`); Napsoft grants still reach every tenant, and writes stay Napsoft-only (M0001-10).
- After login, a user with more than one tenant and none selected lands on tenant selection, management access included, instead of Home (I0001-R003).

### Changed

- Map event-reader capabilities to the M0001-12 reader table: `NAP` reads every event, `*` reads every tenant except Napsoft and no null-tenant events, and a tenant code reads only that tenant (R004). No events route exists yet.
- Docs: the Tenants capability is `NAP::admin-tenancy::control::read/write` in I0001, I0002, and M0001-07; M0003 and I0005 are Accepted; M0001, I0001, and I0002 verification evidence is refreshed after the RBAC rewrite; the roadmap marks admin tenancy, application entry, platform administration screens, and cell provisioning complete.

## [v0.21.0] - 2026-09-28

### Added

- Provision customer tenants from the Tenants screen (I0006). An operator picks a ready cell and names the first administrator with a temporary password. The provisioning worker assigns the cell, seeds the immutable `tenant_admin` role and assigns it to that administrator, then activates the tenant so they can select it. Failures show their code, with Retry, and the screen refreshes while jobs run. Adds `tenant-provision` and `tenant-retry` to `POST /control/provision`, a `job` and `anyActive` to `GET /tenants`, and `ready` to `GET /control/overview` rows. The admin migration is edited in place (new `admin.tenant_provisioning` table), so recreate existing databases.
- Add a show/hide toggle to every password field.

### Changed

- A ready customer membership no longer needs a `member_id`; it only has to be active, since the first administrator has no employee record until the Business Directory module exists.

## [v0.20.1] - 2026-09-28

### Fixed

- Protect the bootstrap Napsoft login: account routes can no longer update, disable, or archive it, removing its Napsoft `platform_admin` assignment is refused, and an `admin.protect_root_user` trigger blocks changes other than password resets. Edits the admin migration in place, so recreate existing databases.
- Refuse to disable or archive a portal user, or suspend or archive a membership, while it holds `tenant_admin` or Napsoft `platform_admin` (`ADMIN_ASSIGNED`); the check fails closed when the tenant's cell is unavailable. M0001-08 adds R007–R008 and M0003 is updated to match.

## [v0.20.0] - 2026-09-28

### Added

- Add role-based access control. Each tenant's cell holds its roles, grants, and role assignments. Grants are capability patterns of the form `TENANT::module::router::action`, where any part may be `*`, and a tenant `*` never matches Napsoft.
- Enforce one capability check on every protected API route. A user's patterns come from their home tenant: Napsoft for Napsoft members, otherwise the selected tenant. The target tenant must also be entitled to the module. A denial returns 403 with the required capability and a reason, and a denied write records an `access.denied` event. The API refuses to start if a route declares no capability, one no module lists, or `read` on a route that is not `GET`.
- Add the Roles screen and the `/api/access-control/v1` routes to list, create, edit, archive, and restore roles and to assign or remove them. You can only give out access you hold yourself, and the last active administrator cannot be removed. Every role change records an administrative event.
- Add `GET /api/admin-tenancy/v1/session/capabilities`. The web app uses it to show only the navigation entries and actions the user can use, and shows the reason when the server denies an action.
- Add `npm run db:provision:napsoft`, which provisions the first cell and runs Napsoft tenant setup. Setup seeds the immutable `platform_admin`, `support`, and `tenant_admin` roles and gives the bootstrap login `platform_admin`.

### Removed

- Remove the root user, `admin.platform_roles`, `admin.support_grants`, and support mode, including its session columns and the `/access` support routes. The admin migration is edited in place, so recreate existing databases.

### Changed

- Rewrite M0003 and I0005 for the simplified RBAC model: roles, grants, and role assignments live only in tenant cells; capabilities are `TENANT::module::router::action`, where tenant `*` excludes Napsoft and entitlements always apply; immutable `platform_admin`, `support`, and `tenant_admin` roles are seeded (Napsoft during Napsoft tenant setup); one `requireCapability` check decides every route, with a no-escalation rule for role changes. The M0001 family, I0001–I0004, architecture docs, guides, and READMEs now describe this model: no root user, no `admin.platform_roles`, and no support mode. M0001-02 becomes Napsoft bootstrap, M0001-09 becomes tenant selection, and M0001-05 is superseded by I0005.
- Add a support access design guide in `docs/design-guides/` (staff roles, impersonation, tickets and consent as support rules, and the tenant support log). Design guides are reference only; the README now lists them and spells out acronyms at first use.

## [v0.19.0] - 2026-09-26

### Added

- Add admin-cell sync (I0004). A sync worker inside the API, started in dev and prod, delivers tenant, membership, and module entitlement changes from `admin.outbox` to each tenant's cell, and portal-access requests from each ready cell's `cell.outbox` to the admin database. Each admin write that increments a synced row's `revision` writes its outbox row in the same transaction. Delivery is per tenant under an advisory lock, applies only the highest pending revision per entity, and retries with backoff up to 5 minutes. The worker backfills every assigned tenant's current rows at start, and the Napsoft tenant's rows when it is first assigned a cell.
- Add `requestPortalAccess`, which cell-side code calls inside its own transaction to turn a tenant user's portal access on or off. The admin side creates, reuses, or suspends the login and membership, and the membership change reaches `cell.tenant_members`. Temporary passwords are hashed before they are written; only the hash is stored.
- Add managed event keys `sync.delivery.failed`, `sync.delivery.recovered`, `portal_access.applied`, and `portal_access.failed`.

## [v0.18.3] - 2026-09-26

### Changed

- Every write to a tenant, membership, or module entitlement row that changes a field copied to cells, or archives or restores the row, now increments its `revision`. Membership suspend, activate, archive, restore, and provisioning results previously left `revision` unchanged, so a cell comparing revisions would have ignored them. The rule lives in a shared `RevisionedTableModel` that covers single, `Where`, bulk, and upsert writes; upserts of the same new row wait on an advisory lock so the second sees the first's revision.
- PRD identifiers that are out of order or wrong may be renumbered after asking the developer, instead of never.

## [v0.18.2] - 2026-09-25

### Changed

- Read and write tables through the pg-schemata models instead of raw SQL in the integration tests and three model methods (`cell_provisioning.hasActive` and `requeueRunning`, and the removed `sessions.findById`). Raw SQL remains only where no model applies: role and database setup, catalog checks, and tests that prove the database rejects invalid writes.

## [v0.18.1] - 2026-09-25

### Changed

- Lower the minimum password length from 12 to 8 characters. A temporary password for a new portal user may now be any nonempty password up to 128 characters, since the user must replace it at first login.

## [v0.18.0] - 2026-09-25

### Added

- Add cell provisioning (I0003): a worker inside the API takes a registered cell through setup, migration, seed, and activation with no restart. Locally it creates the cell database on the admin server; in production it creates one Render Postgres instance per cell. Activation saves the cell's connection to `CELL_DATABASES_<ENV>`, and the first provisioned cell becomes the Napsoft tenant's cell, so root can select Napsoft.
- Add the runtime cell registry: the API loads published cells at startup, checks each one (registered, enabled, reachable, physical identity), and serves tenant selection and cell readiness from it. A broken cell reports its reason without stopping startup.
- Add `cell-activate` to `POST /control/provision`, and on the Cells screen a failure code column, auto-refresh while jobs run, a progress dialog, and an Activate action.
- Select the tenant automatically after login when exactly one is eligible.

### Changed

- Replace the separate platform (`/management`) and tenant (`/app/:tenantId`) shells with one application shell at `/home`. Tenant Management stays in the navigation whether or not a tenant is selected, the tenant control can switch tenants, and it shows `Select tenant` when none is selected.
- Startup now requires the `nap-admin` password (`NAP_ADMIN_PSWD_DEV`, or `adminPassword` in `ADMIN_DATABASE_PROD`) and, in production, the Render API settings, because the provisioning worker needs them.

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
