# I0003: Cell Provisioning

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Draft                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Type                 | Inter-module workflow                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Related architecture | [Admin and cells](../../architecture/admin-cells.md), [Migrations](../../architecture/migrations.md), [BFF](../../architecture/bff.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Related PRDs         | [M0001-02: Root User Provisioning](../modules/M0001-admin-tenancy/M0001-02-root-user-provisioning.md), [M0001-06: Cell Management](../modules/M0001-admin-tenancy/M0001-06-cell-management.md), [M0001-09: Tenant Selection And Support Access](../modules/M0001-admin-tenancy/M0001-09-tenant-selection-and-support-access.md), [M0002-01: Cell Database Foundation](../modules/M0002-cell-tenancy/M0002-01-cell-database-foundation.md), [M0002-02: Physical Identity](../modules/M0002-cell-tenancy/M0002-02-physical-identity.md), [I0002: Platform Administration Screens](I0002-platform-administration-screens.md) |
| Related decisions    | The worker runs inside the API; a cell lives on the admin server locally and on its own Render instance in production                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Last reviewed        | 2026-09-24                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## 2. Purpose

Take a cell from "registered" to "serving tenants" with no terminal and no
restart. Today an operator can register a cell from the Cells screen, but
nothing runs the queued job, the API has no connection to any cell, and every
tenant selection returns `503 CELL_UNAVAILABLE`.

After this PRD, a root operator on a new install registers one cell, watches
it provision on the Cells screen, and then selects the Napsoft tenant.

## 3. Scope

### Included

- A provisioning worker inside the API.
- The four stages: setup, migration, seed, and activation.
- Saving and publishing each cell's connection.
- The runtime cell registry: loading published cells at startup, adding newly
  activated cells while the API runs, readiness, and finding a tenant's cell.
- Root tenant setup: the first provisioned cell becomes the Napsoft tenant's
  cell, and the Napsoft tenant becomes selectable.
- A `cell-activate` operation that re-enables a disabled cell.
- Cells screen changes: failure code, progress refresh, progress details,
  Activate, and a Disable confirmation.

### Excluded

- Rechecking cells after startup and returning a recovered cell to service.
- Opening tenant transactions and setting `nap.tenant_id` (tenant context).
- Assigning tenants other than Napsoft to cells.
- Copying later tenant, membership, and entitlement changes into cells (the
  sync workflows).
- Seeding reference data. No cell module has seed data yet.
- Deleting a cell, its database, or its Render instance.

## 4. Actors And Permissions

| Actor                         | Permission                        | Can do                                            |
| ----------------------------- | --------------------------------- | ------------------------------------------------- |
| Root user or `platform_admin` | `admin-tenancy::control::read`    | See cells, progress, and failure codes            |
| Root user or `platform_admin` | `admin-tenancy::control::write`   | Register, retry, activate, or disable a cell      |
| `support`                     | `admin-tenancy::control::write`   | Same, except on a cell holding the Napsoft tenant |
| Provisioning worker           | Trusted in-process runner context | Claim a queued job and advance it (M0001-06 §4)   |

Only root holds these capabilities today (M0001-05).

## 5. Concepts And Terminology

| Term                  | Meaning                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Job                   | A cell's `admin.cell_provisioning` row. Its `requested_action` is `provision` (all four stages) or `activate` (activation only) |
| Worker                | The loop inside the API process that claims and runs queued jobs                                                                |
| Provisioning state    | Private, resumable secrets for one environment: role passwords and, in production, Render instance details                      |
| Cell connection map   | `CELL_DATABASES_<ENV>`: cell ID to connection, read at startup and written by activation                                        |
| Runtime cell registry | The in-process map from cell ID to a `nap-app` connection and its readiness                                                     |
| Ready cell            | A cell that is enabled in `admin.cells`, reachable, and passes the M0002-02 identity check                                      |
| Operation marker      | A comment on the cell database, `nap:<operation_id>`, that proves this job created it                                           |

## 6. Functional Requirements

### Worker

- I0003-R001: The API must start a provisioning worker at startup in `dev` and `prod`, and must not start it in `test`.
- I0003-R002: On start, the worker must return any job left `running` to `queued`, so a crash never strands a job.
- I0003-R003: The worker must check for queued jobs every second and run one job at a time per process.
- I0003-R004: The worker must claim a job with a row lock that skips rows another process holds, so two API instances never run the same job.
- I0003-R005: On shutdown, the worker must stop after the current step and return an unfinished job to `queued`, not `failed`.
- I0003-R006: The worker must record each stage change through M0001-06's `advanceCellProvisioning`, so the stage rules and events stay M0001-06's.

### Stages

- I0003-R007: **Setup** must create the cell database, or reuse it when it carries this job's operation marker and is owned by `nap-admin`, then apply and verify the database grant contract (`configureDatabase`, `verifyDatabase`).
  - `dev`: create the database on the admin server through `SETUP_DATABASE_<ENV>`, using the existing `nap-admin` and `nap-app` roles.
  - `prod`: create one Render Postgres instance per cell, wait until it is available, and create `nap-admin` and `nap-app` in it (`prepareProviderRoles`).
- I0003-R008: **Migration** must run `migrateCell` as `nap-admin`, then write the `cell.physical_identity` row with the cell ID, database name, operation ID, and environment. An existing identity row must match these values exactly.
- I0003-R009: **Seed** must run every cell module's seed step. With none registered, it advances without doing anything.
- I0003-R010: **Activation** must, in order:
  1. save and publish the cell's connection (R011);
  2. add the cell to the runtime cell registry (R018), which runs the readiness checks;
  3. complete the job through `advanceCellProvisioning`, which enables the cell;
  4. run root tenant setup when it applies (R024).

  If step 1, 2, or 3 fails, the job fails with that step's code and the cell stays disabled.

### Connections

- I0003-R011: Activation must save the cell's connection so a restarted API finds it:
  - `dev`: merge `{ "<cell-id>": "<endpoint>" }` into `CELL_DATABASES_DEV` in the private `.env` file; passwords stay in `NAP_*_PSWD_DEV`.
  - `prod`: merge `{ "<cell-id>": { endpoint, appPassword, adminPassword } }` into the Render service's `CELL_DATABASES_PROD` variable.
- I0003-R012: Publishing must fail with `PUBLISH_CONFLICT` if the map already holds a different connection for the same cell ID.
- I0003-R013: Provisioning state must be saved before any step whose outcome could be lost, and reused on retry: the `dev` state file (`withState`), or the `NAP_PROVISION_STATE_PROD` Render variable.

### Runtime cell registry

- I0003-R014: At startup, after the admin database is ready, the API must read `CELL_DATABASES_<ENV>` (absent means no cells) and load each listed cell into the registry. Malformed JSON, a key that is not a UUID, or an entry with no endpoint must stop startup with `INVALID_CONFIGURATION` naming the setting.
- I0003-R015: Loading a cell must run these checks in order and record the first failure as the cell's not-ready reason:

  | Check                                | Reason if it fails    |
  | ------------------------------------ | --------------------- |
  | The cell has an `admin.cells` record | `CELL_NOT_REGISTERED` |
  | The record is enabled                | `CELL_DISABLED`       |
  | A `nap-app` connection works         | `CELL_UNREACHABLE`    |
  | `verifyPhysicalIdentity` passes      | The M0002-02 reason   |

- I0003-R016: A cell that fails to load must not stop startup or affect other cells. Admin routes and ready cells keep serving.
- I0003-R017: The registry must expose `readiness(cellId)`, returning `{ ready: true }` or `{ ready: false, reason }`. A cell the registry does not hold returns `CELL_NOT_CONFIGURED`.
- I0003-R018: The registry must expose `add(cellId, connection)` for activation. It runs the R015 checks except the enabled check, because activation enables the cell next. If the registry already holds the cell, it re-runs the checks on the existing connection instead of opening a second one.
- I0003-R019: The registry must expose `cellFor(session)`, which finds the session tenant's `cell_id` in `admin.tenants` and returns that cell's connection when it is ready, and throws `CELL_UNAVAILABLE` otherwise. The cell always comes from the tenant record, never from the request (M0001-09-R006).
- I0003-R020: The API must pass the registry as the `runtime` collaborator to `selectTenant` (M0001-09) and `getCellReadiness` (M0001-06).
- I0003-R021: Disabling a cell must mark it not ready (`CELL_DISABLED`) in the registry at once. Activating it again must make it ready.
- I0003-R022: Shutdown must close every cell connection.

### Root tenant setup

- I0003-R023: Root tenant setup applies when a job completes and the Napsoft tenant (`is_napsoft`) has no `cell_id`, and is retried until it finishes. Later cells never change the Napsoft tenant's cell.
- I0003-R024: Root tenant setup must:
  1. set the Napsoft tenant's `cell_id` to the completed cell, in the transaction that completes the job;
  2. write the Napsoft tenant into the cell's `cell.tenants` (ID, code, status, revision);
  3. write the root user's Napsoft membership into `cell.tenant_members` (membership ID, tenant ID, `portal_user_id`, status, revision; `member_type` and `member_id` null);
  4. read both rows back and confirm they match admin;
  5. set the Napsoft tenant's `provisioned` and `rbac_ready` to true;
  6. record a managed event.
- I0003-R025: If steps 2–5 fail, the cell stays enabled and assigned, the Napsoft tenant stays not provisioned, and the worker retries on its next check until setup succeeds. The Cells screen shows `ROOT_SETUP_FAILED` for that cell until then.
- I0003-R026: `rbac_ready` is true for the Napsoft tenant because root needs no cell-side roles: its authority comes from `is_root` (M0001-05).

### Operations

- I0003-R027: `POST /control/provision` must accept `{ "operation": "cell-activate", "cell": "<uuid>" }`. It must queue an `activate` job for a disabled cell whose last job is `completed`, and reject any other state with `409 INVALID_STATE`.
- I0003-R028: An `activate` job must run activation only, reusing the saved connection.

### Cells screen

- I0003-R029: The Cells screen must show each cell's failure code.
- I0003-R030: The Cells screen must refresh the list every 2 seconds while any cell is `queued` or `running`, and stop when none is.
- I0003-R031: Each row's menu must offer **View progress**, which opens a dialog with the cell ID, stage, status, attempts, failure code, and the next action an operator can take.
- I0003-R032: Each row's menu must offer **Activate** for a disabled cell whose last job is `completed`, calling R027.
- I0003-R033: Disable must ask for confirmation before it runs.

## 7. Business Rules And Invariants

- I0003-R034: A cell is enabled only by a successful activation (M0001-06-R006). An activation failure leaves it disabled.
- I0003-R035: When a create request's outcome is unknown (the request was sent but no answer came back), the job must fail with `CREATE_OUTCOME_UNKNOWN` rather than create a second database or instance. An operator checks the provider, then retries.
- I0003-R036: Setup must refuse a database or Render instance that exists without this job's operation marker, with `TARGET_NOT_OWNED`.
- I0003-R037: The API process must hold the `nap-admin` password: `NAP_ADMIN_PSWD_<ENV>` locally, `adminPassword` in `ADMIN_DATABASE_PROD` in production. Production also needs `RENDER_API_KEY` and `RENDER_API_SERVICE_ID`.
- I0003-R038: The runtime registry connects only as `nap-app`. Only the worker uses `nap-admin`.

## 8. Lifecycle And State Transitions

Stages and statuses are M0001-06's. This PRD adds the worker transitions,
`cell-activate`, and root tenant setup.

| Starting state                      | Trigger                   | Result                                                         |
| ----------------------------------- | ------------------------- | -------------------------------------------------------------- |
| `registered/queued`                 | Worker claims the job     | `setup/running`; attempts incremented                          |
| `setup/running`                     | Setup passes              | `migration/running`                                            |
| `migration/running`                 | Migration passes          | `seed/running`                                                 |
| `seed/running`                      | Seed passes               | `activation/running`                                           |
| `activation/running`                | Activation passes         | `complete/completed`; cell enabled and ready in the registry   |
| Any stage, `running`                | Step fails                | Same stage, `failed`, failure code; cell disabled              |
| Any stage, `running`                | API shuts down or crashes | Returned to `queued` on the next start                         |
| `failed`                            | Retry (M0001-06)          | `registered/queued`, same IDs; reruns from setup, reusing work |
| `complete/completed`, cell disabled | `cell-activate`           | `activation/queued` with `requested_action = activate`         |
| `activation/queued` (`activate`)    | Worker claims the job     | `activation/running`, then `complete/completed`; cell enabled  |

| Napsoft tenant state           | Trigger                  | Result                                          |
| ------------------------------ | ------------------------ | ----------------------------------------------- |
| No cell                        | First job completes      | Cell assigned; root tenant setup runs           |
| Cell assigned, not provisioned | Root tenant setup passes | `provisioned` and `rbac_ready` true; selectable |
| Cell assigned, not provisioned | Root tenant setup fails  | Unchanged; retried on the worker's next check   |

Failure codes: `SETUP_FAILED`, `TARGET_NOT_OWNED`, `CREATE_OUTCOME_UNKNOWN`,
`MIGRATION_FAILED`, `SEED_FAILED`, `PUBLISH_CONFLICT`, `PUBLISH_FAILED`,
`CONFIGURATION_MISSING`, `ROOT_SETUP_FAILED`, and the not-ready reasons in
R015.

## 9. Data Requirements

No schema change. The worker writes:

- `admin.cell_provisioning` and `admin.cells`, through M0001-06's operations;
- `admin.tenants.cell_id`, `provisioned`, and `rbac_ready` for the Napsoft
  tenant only;
- `cell.physical_identity`, `cell.tenants`, and `cell.tenant_members` in the
  new cell.

`requested_action` already allows `activate`.

Secrets live only in the provisioning state and the cell connection map,
never in admin tables:

| Where                                    | Holds                                                        |
| ---------------------------------------- | ------------------------------------------------------------ |
| `dev` state file (`NAP_PROVISION_STATE`) | Operation IDs and progress per cell                          |
| `NAP_PROVISION_STATE_PROD`               | Render instance IDs, operation IDs, generated role passwords |
| `CELL_DATABASES_DEV` in `.env`           | Cell ID to endpoint                                          |
| `CELL_DATABASES_PROD`                    | Cell ID to endpoint and role passwords                       |

## 10. API Requirements

| Method and route                                              | Change                                                                                                      |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `POST /api/admin-tenancy/v1/control/provision`                | Adds `cell-activate` (R027). Requires `admin-tenancy::control::write`. Returns `200` with the queued job.   |
| `POST /api/admin-tenancy/v1/access/select` (M0001-09)         | Succeeds for a tenant whose cell is ready; `503 CELL_UNAVAILABLE` otherwise. Today it always returns `503`. |
| `GET /api/admin-tenancy/v1/control/cell-readiness` (M0001-06) | `runtime` reports the registry's `readiness(cellId)`. Today it reports `{ ready: false, checked: false }`.  |
| `GET /api/admin-tenancy/v1/control/overview`                  | No change; the screen already receives `failure_code`.                                                      |

The worker calls M0001-06's internal `advanceCellProvisioning`; it adds no
public route.

## 11. Cross-Module Interactions

- M0001-06 owns cell registration, stage and status rules, and the failure and
  completion events. The worker drives them; it does not duplicate them.
- M0001-09 owns tenant selection. This PRD supplies its `runtime`
  collaborator.
- M0001-07 owns `admin.tenants`. This PRD writes only the Napsoft tenant's
  `cell_id`, `provisioned`, and `rbac_ready`.
- M0002-01's `migrateCell` builds the cell schema. M0002-02's
  `verifyPhysicalIdentity` gates every registry load.
- I0002 owns the Cells screen; this PRD adds to it (R029–R033).

## 12. Security And Audit

- I0003-R039: Failure codes, not-ready reasons, logs, events, and API responses must not contain passwords, connection strings, endpoints, or Render API keys (M0001-06-R008).
- I0003-R040: The `dev` state file and `.env` must stay mode `0600`; a file readable by others fails with `UNSAFE_STATE_FILE`.
- I0003-R041: `cell-activate` and root tenant setup must each record a managed event.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                                                             | Requirements                                       |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| AC01      | On a new `dev` install with a bootstrapped root user, registering one cell leads, with no other action and no restart, to an enabled, ready cell and a Napsoft tenant that root can select. | I0003-R001, R003, R007–R011, R018, R020, R023–R026 |
| AC02      | After a restart, the API loads the published cell from `CELL_DATABASES_DEV` and root can still select the Napsoft tenant.                                                                   | I0003-R014, R015, R017, R019                       |
| AC03      | Each row of the R015 table produces its reason from `readiness`; a cell that fails to load leaves admin routes and other cells serving.                                                     | I0003-R015–R017                                    |
| AC04      | A job left `running` by a killed API is queued again and completes on the next start.                                                                                                       | I0003-R002, R005                                   |
| AC05      | Two workers against one admin database never run the same job.                                                                                                                              | I0003-R004                                         |
| AC06      | A failed step leaves the cell disabled with its failure code; retry completes it, reusing the database it created.                                                                          | I0003-R006, R013, R034                             |
| AC07      | An existing database without this job's marker, or an unknown create outcome, fails without creating anything.                                                                              | I0003-R035, R036                                   |
| AC08      | A conflicting entry in the cell connection map fails activation with `PUBLISH_CONFLICT`.                                                                                                    | I0003-R012                                         |
| AC09      | Disabling a cell makes it not ready at once; activating it makes it ready again without rerunning setup, migration, or seed.                                                                | I0003-R021, R027, R028, R041                       |
| AC10      | A second provisioned cell does not change the Napsoft tenant's cell. A failed root tenant setup is retried and then succeeds.                                                               | I0003-R023, R025                                   |
| AC11      | The Cells screen shows failure codes, refreshes while jobs run, opens progress details, confirms Disable, and offers Activate only when allowed.                                            | I0003-R029–R033                                    |
| AC12      | No response, log, event, failure code, or not-ready reason contains a secret or endpoint.                                                                                                   | I0003-R039, R040                                   |
| AC13      | `prod` setup creates one Render instance per cell and publishes to `CELL_DATABASES_PROD`, verified against a mocked Render API.                                                             | I0003-R007, R011, R037                             |

## 14. Outstanding Questions

None.
