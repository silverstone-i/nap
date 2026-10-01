# I0006: Tenant Provisioning

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Implemented                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Type                 | Inter-module workflow                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Related architecture | [Admin and cells](../../architecture/admin-cells.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Related PRDs         | [M0001-07: Tenant Creation](../modules/M0001-admin-tenancy/M0001-07-tenant-creation.md), [M0001-08: Portal User And Membership Administration](../modules/M0001-admin-tenancy/M0001-08-portal-user-and-membership-administration.md), [M0001-09: Tenant Selection](../modules/M0001-admin-tenancy/M0001-09-tenant-selection-and-support-access.md), [M0003: Access Control](../modules/M0003-access-control.md), [I0002: Platform Administration Screens](I0002-platform-administration-screens.md), [I0003: Cell Provisioning](I0003-cell-provisioning.md), [I0004: Admin-Cell Sync](I0004-admin-cell-sync.md) |
| Related decisions    | The provisioning worker from I0003 runs tenant jobs too; the first `tenant_admin` is named when provisioning is requested; the operator picks the cell; a tenant starts from a Napsoft client                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Last reviewed        | 2026-09-30                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## 2. Purpose

Let an operator turn one of Napsoft's clients into a usable customer tenant.
A customer is first a client in the Napsoft tenant's directory (M0005), which
holds its legal name, tax ID, and contacts. From that client record the
operator creates the tenant, picks a ready cell, and names the tenant's first
administrator. That person signs in with a temporary password, selects the
tenant, and holds `tenant_admin`.

## 3. Scope

### Included

- A `tenant-provision` operation that creates the tenant from a Napsoft
  client and names the cell and the first administrator, and a
  `tenant-retry` operation.
- A tenant provisioning job stored in the admin database.
- The worker stages: assignment, seed, and activation.
- Creating or reusing the first administrator's login and membership.
- Running M0003's customer-tenant seed (M0003-R009) and assigning
  `tenant_admin` to the first administrator.
- A **Provision tenant** action on a Napsoft client record, and Tenants
  screen progress, failure code, Retry, and View client.

### Excluded

- The Napsoft tenant. I0003 provisions it.
- Choosing a cell automatically, cell capacity, and moving a tenant between
  cells.
- Tenant suspend, archive, and reinstate.
- Later tenant, membership, and entitlement changes. I0004 delivers them.
- Emailed invitations. The first administrator gets a temporary password
  (M0001-08).
- Seeding module reference data. No cell module has seed data yet.

## 4. Actors And Permissions

| Context            | Actor               | Required permission                  | Required state                                                | Result                      |
| ------------------ | ------------------- | ------------------------------------ | ------------------------------------------------------------- | --------------------------- |
| Tenants screen     | Authorized operator | `NAP::admin-tenancy::control::read`  | Any                                                           | See provisioning progress   |
| `tenant-provision` | Authorized operator | `NAP::admin-tenancy::control::write` | Active Napsoft client with no tenant; unused code; cell ready | Tenant created; job queued  |
| `tenant-retry`     | Authorized operator | `NAP::admin-tenancy::control::write` | Tenant's job `failed`                                         | Job queued again            |
| Either operation   | Any caller          | Missing the permission               | Any                                                           | `403`                       |
| Worker             | Provisioning worker | Trusted in-process runner context    | Queued job                                                    | Claims and advances the job |

## 5. Concepts And Terminology

| Term                | Meaning                                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| Ready cell          | A cell that is enabled, reachable, and passes its identity check (I0003-R015)                               |
| Seed                | Rows a new cell needs before use; here, the `tenant_admin` role and its first assignment                    |
| Customer tenant     | Any tenant that is not the Napsoft tenant (`is_napsoft = false`)                                            |
| Tenant job          | The admin record tracking one tenant's provisioning: target cell, stage, status, attempts, and failure code |
| First administrator | The portal user named in `tenant-provision`, who receives the tenant's first `tenant_admin` assignment      |
| Provisioned tenant  | `status = active`, `provisioned = true`, `rbac_ready = true`; selectable under M0001-09                     |

## 6. Functional Requirements

### Operations

- I0006-R001: `POST /control/provision` must accept
  `{ "operation": "tenant-provision", "client": "<uuid>", "code": "...", "name": "...", "tier": "...", "cell": "<uuid>", "admin": { "email": "...", "password": "...", "firstName": "...", "lastName": "..." } }`
  (names added by M0005-R021). `client` is a party ID in the Napsoft
  tenant's directory; `code`, `name`, and `tier` are normalized and validated as in M0001-07.
  In one admin transaction it must create a `pending` customer tenant with
  `client_id` set to the client, and queue its tenant job. It must reject:
  - a client that is not an active `client` of the Napsoft tenant, read from
    the Napsoft cell, with `404 NOT_FOUND`;
  - a code or client already used by an active tenant with `409 CONFLICT`;
  - a cell that is not ready (I0003-R017), or an unreachable Napsoft cell,
    with `503 CELL_UNAVAILABLE`.

  A rejected request creates no tenant, job, login, or membership. Tenants
  are created only this way; M0001-07's `POST /tenants` is withdrawn.

- I0006-R002: `tenant-provision` must, in the transaction that queues the
  job, create or reuse the first administrator's login and create their
  membership in the tenant, following M0001-08's rules for email, temporary
  password, and reuse. The membership has `member_type = employee` and starts
  `pending`.
- I0006-R003: `tenant-provision` must require an `Idempotency-Key`. The same
  key and payload return the original result; the same key with a different
  payload returns `409 IDEMPOTENCY_CONFLICT`.
- I0006-R004: `POST /control/provision` must accept
  `{ "operation": "tenant-retry", "tenant": "<uuid>" }`, which returns a
  `failed` tenant job to `queued` at the stage that failed and increments
  attempts. Any other state returns `409 INVALID_STATE`.

### Worker

- I0006-R005: The I0003 provisioning worker must claim and run tenant jobs
  with the same guarantees it gives cell jobs: one job at a time per process,
  a row lock that skips rows another process holds, `running` jobs requeued
  on start and shutdown (I0003-R002–R005).
- I0006-R006: **Assignment** must, in one admin transaction, set the tenant's
  `cell_id` to the job's cell and enqueue the tenant's synced rows for that
  cell (I0004-R019). It must fail with `CELL_UNAVAILABLE` if the cell is not
  ready.
- I0006-R007: **Seed** must, in one cell transaction as `nap-admin`:
  1. write the tenant into `cell.tenants` (ID, code, status, revision);
  2. write the first administrator's membership into `cell.tenant_members`;
  3. run M0003's customer-tenant seed, creating the immutable `tenant_admin`
     role with grant `<CODE>::*::*::*`;
  4. assign `tenant_admin` to the first administrator;
  5. run M0005's directory seed: the default labels, and the first
     administrator as an employee with their login email as primary email
     (M0005-R022).

  It must then read the rows back and confirm they match admin. A mismatch
  fails with `SEED_FAILED`; a seeded role whose grants differ fails with
  `SEED_DRIFT` (M0003-R010).

- I0006-R008: **Activation** must run only after the seed stage has
  confirmed the `tenant_admin` role and assignment in the cell (R007). In one
  admin transaction it must set the tenant to `active`, `provisioned = true`,
  and `rbac_ready = true`, set the first administrator's membership to
  `active` and ready, complete the job, advance the tenant cache revisions,
  and record a managed event.
- I0006-R009: Each stage must be safe to rerun: retrying after a failure must
  not duplicate rows in admin or the cell.

### Tenants screen

- I0006-R010: A client record in the Napsoft tenant's directory must show
  the client's tenant, or offer **Provision tenant** when it has none to an
  operator with `NAP::admin-tenancy::control::write`. The dialog takes the
  code, name (prefilled with the legal name), tier, a ready cell, the first
  administrator (pickable from the client's contacts), and a temporary
  password. Each Tenants row with a client offers **View client**, opening
  that client record. The client record's contact list shows each contact's
  primary email and phone and whether it is a primary or billing contact
  (M0005-R004).
- I0006-R011: The Tenants screen must show each tenant's job stage, status,
  and failure code, and refresh every 2 seconds while any tenant job is
  `queued` or `running`.
- I0006-R012: Each row's menu must offer **Retry** for a tenant whose job is
  `failed`.

## 7. Business Rules And Invariants

- I0006-R013: A tenant has at most one tenant job. A completed job is never
  rerun.
- I0006-R014: A tenant's cell never changes after assignment. Retry reuses
  the job's cell even if a different cell is now available.
- I0006-R015: Provisioning must not change the Napsoft tenant or any other
  tenant's rows.
- I0006-R016: The first administrator cannot select the tenant before
  activation; their membership stays not ready until then.

## 8. Lifecycle And State Transitions

| Starting state            | Trigger               | Result                                                                    |
| ------------------------- | --------------------- | ------------------------------------------------------------------------- |
| Napsoft client, no tenant | `tenant-provision`    | Tenant `pending`; job `assignment/queued`; login and membership `pending` |
| `assignment/queued`       | Worker claims the job | `assignment/running`                                                      |
| `assignment/running`      | Assignment passes     | `seed/running`; tenant has its cell                                       |
| `seed/running`            | Seed passes           | `activation/running`                                                      |
| `activation/running`      | Activation passes     | `complete/completed`; tenant provisioned; membership active               |
| Any stage, `running`      | Step fails            | Same stage, `failed`, failure code; tenant stays `pending`                |
| Any stage, `running`      | API stops or crashes  | Same stage, `queued` on next start                                        |
| Any stage, `failed`       | `tenant-retry`        | Same stage, `queued`; attempts incremented                                |

Failure codes: `CELL_UNAVAILABLE`, `SEED_FAILED`, `SEED_DRIFT`,
`ACTIVATION_FAILED`.

## 9. Data Requirements

M0001 admin-tenancy owns a new tenant job record, one per tenant:

| Field                 | Meaning                                           |
| --------------------- | ------------------------------------------------- |
| `tenant_id`           | The tenant; unique                                |
| `cell_id`             | Target cell chosen in `tenant-provision`          |
| `admin_membership_id` | The first administrator's membership              |
| `admin_first_name`    | The first administrator's first name (M0005-R021) |
| `admin_last_name`     | The first administrator's last name (M0005-R021)  |
| `stage`               | `assignment`, `seed`, `activation`, or `complete` |
| `status`              | `queued`, `running`, `failed`, or `completed`     |
| `attempts`            | Number of retries                                 |
| `failure_code`        | Last failure code, or null                        |

The workflow also writes:

- `admin.tenants`: a new row with `client_id` (nullable, immutable, unique
  among active tenants), then `cell_id`, `status`, `provisioned`,
  `rbac_ready`;
- `admin.portal_users` and `admin.portal_user_tenants` for the first
  administrator, through M0001-08's domain functions;
- `cell.tenants`, `cell.tenant_members`, and M0003's `roles`, `role_grants`,
  and `role_assignments` in the tenant's cell.

The temporary password is stored only as M0001-03's password hash, never on
the job.

The first administrator's membership gets a generated `member_id` when it is
created, and the seed stage creates the employee with that ID (M0005-R021,
R022). An active, ready customer membership must have a `member_id`
(M0005-R023).

## 10. API Requirements

| Method and route                                        | Change                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/admin-tenancy/v1/control/provision`          | Adds `tenant-provision` (R001–R003) and `tenant-retry` (R004). Requires `NAP::admin-tenancy::control::write`. Returns `200` with the job. Validation `400`, denial `403`, unknown client `404`, code, client, state, and idempotency conflicts `409`, unready cell `503`. |
| `POST /api/admin-tenancy/v1/tenants` (M0001-07)         | Withdrawn (R001).                                                                                                                                                                                                                                                         |
| `GET /api/admin-tenancy/v1/control/overview` (M0001-06) | Each row adds `ready`, the runtime registry's readiness, so the Provision dialog lists only ready cells (R010).                                                                                                                                                           |
| `GET /api/admin-tenancy/v1/tenants` (I0002)             | Each row adds `clientId` and `job: { stage, status, attempts, failureCode } \| null`; the response adds `anyActive`. `?clientId=<uuid>` returns that client's tenants, unpaged (R010).                                                                                    |
| `POST /api/admin-tenancy/v1/access/select` (M0001-09)   | No change. Succeeds for a provisioned tenant and a ready active membership.                                                                                                                                                                                               |

## 11. Cross-Module Interactions

- M0001-07 owns `admin.tenants`. This workflow is now its only creator and
  writes only the fields in §9.
- M0005 owns the Napsoft client record. This workflow reads it from the
  Napsoft cell to check the client, and never copies its contacts.
- M0001-08 owns login and membership rules. This workflow calls its domain
  functions instead of repeating them.
- M0003 owns the customer-tenant seed (M0003-R009) and seed drift rules
  (M0003-R010). This workflow runs it.
- I0003 owns the worker and the runtime cell registry. Assignment and seed use
  `readiness(cellId)` and the cell's `nap-admin` connection.
- I0004 delivers later changes to the tenant and membership copies. The
  seed's direct writes and the assignment backfill (I0004-R019) must carry the
  same revisions, so applying the backfill changes nothing.
- I0002 owns the Tenants screen; this workflow adds to it (R010–R012).

## 12. Security And Audit

- I0006-R017: Responses, logs, events, and failure codes must not contain the
  temporary password, connection strings, or endpoints.
- I0006-R018: `tenant-provision`, `tenant-retry`, a failed stage, and
  completion must each record a managed event without request headers or
  secrets.
- I0006-R019: The first administrator must change their password at first
  login (`must_change_password`, M0001-08).

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                                                                                   | Requirements                      |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| AC01      | Provisioning a tenant from a Napsoft client into a ready cell leads, with no other action, to a provisioned tenant that the first administrator can select after changing their password, holding `tenant_admin`. | I0006-R001, R002, R005–R008, R019 |
| AC02      | The cell holds exactly one immutable `tenant_admin` role with grant `<CODE>::*::*::*` and one assignment to the first administrator.                                                                              | I0006-R007                        |
| AC03      | The first administrator cannot select the tenant before activation.                                                                                                                                               | I0006-R016                        |
| AC04      | A failure at each stage leaves the tenant `pending` with the failure code; retry completes it without duplicate rows.                                                                                             | I0006-R004, R009, R014            |
| AC05      | A job left `running` by a stopped API completes after restart; two workers never run the same job.                                                                                                                | I0006-R005                        |
| AC06      | An unknown client, a vendor, a client or code already used, or a cell that is not ready is rejected without creating a tenant, job, login, or membership.                                                         | I0006-R001, R013, R015            |
| AC07      | A repeated `Idempotency-Key` returns the original job; a reused key with a different payload is rejected.                                                                                                         | I0006-R003                        |
| AC08      | An existing active login with the same email is reused rather than duplicated.                                                                                                                                    | I0006-R002                        |
| AC09      | A Napsoft client offers Provision tenant only without a tenant; the Tenants screen offers View client and Retry, shows stage and failure code, and refreshes while jobs run.                                      | I0006-R010–R012                   |
| AC10      | No response, log, event, or failure code contains the temporary password or a connection detail.                                                                                                                  | I0006-R017, R018                  |

### Verification Evidence

Implemented in [silverstone-i/nap#44](https://github.com/silverstone-i/nap/pull/44).
Revised in [silverstone-i/nap#52](https://github.com/silverstone-i/nap/pull/52)
to provision from a Napsoft client (R001, R007, R010). On 2026-09-30, lint,
formatting, `npm test` (549 API, 175 web), and `npm run test:db:local` (252
tests) passed. `tenant-provisioning.test.js` now creates each tenant from a
client in the Napsoft cell and rejects an unknown client, a vendor, a reused
client or code, and an unready cell (AC06).
On 2026-09-28, lint, formatting, `npm test` (520 API, 148 web), `npm run build`,
and `npm run test:db:local` (231 tests) passed.

[tenant-provisioning.test.js](../../../apps/api/tests/integration/tenant-provisioning.test.js)
runs against a real cell. It covers queueing, the first administrator's
blocked selection before activation, and key replay, including a different
temporary password (AC03, AC07). It provisions the tenant end to end and
selects it holding one immutable `tenant_admin` (AC01, AC02), and rejects the
Napsoft tenant, a provisioned tenant, and a cell that is not ready (AC06). It
also retries a failed seed stage without duplicates while reusing the login
(AC04, AC08) and requeues a job left running (AC05).
[TenantsPage.test.jsx](../../../apps/web/tests/pages/TenantsPage.test.jsx)
covers Provision, Retry, and refresh (AC09).

## 14. Outstanding Questions

None.
