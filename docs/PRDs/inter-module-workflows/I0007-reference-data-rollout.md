# I0007: Reference-Data Rollout

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Status               | Implemented                                                                                                                                                                                                                                                                                      |
| Type                 | Inter-module workflow                                                                                                                                                                                                                                                                            |
| Related architecture | [Migrations](../../architecture/migrations.md), [Admin and cells](../../architecture/admin-cells.md)                                                                                                                                                                                             |
| Related PRDs         | [M0004: Reference Data](../modules/M0004-reference-data.md), [I0003: Cell Provisioning](I0003-cell-provisioning.md), [M0001-06: Cell Management](../modules/M0001-admin-tenancy/M0001-06-cell-management.md), [I0002: Platform Administration Screens](I0002-platform-administration-screens.md) |
| Related decisions    | None                                                                                                                                                                                                                                                                                             |
| Last reviewed        | 2026-09-29                                                                                                                                                                                                                                                                                       |

## 2. Purpose

When a release raises the reference seed version (M0004-R004), every existing
cell becomes not ready with `SEED_MISSING` (M0004-R007), and its tenants get
`503 CELL_UNAVAILABLE` until the new snapshot is loaded. Today the only fix is
recreating the cell.

This PRD lets an operator load the new snapshot into existing cells from the
Cells screen, see which cells are done, queued, or failed, and retry the
failures. No terminal, no restart, and no cell is recreated.

## 3. Scope

### Included

- A `seed` job action that runs the seed and activation stages on an existing cell.
- A single-cell operation and a bulk operation that queue `seed` jobs.
- Rollout status on the Cells screen: declared version, per-cell seed state, and counts.
- Retry of a failed `seed` job through the existing cell retry.

### Excluded

- The snapshot, the seed step, and the readiness check: M0004.
- Queuing `seed` jobs automatically at startup (Outstanding Questions).
- Rolling out cell schema migrations to existing cells (M0002 excludes it; separate work).
- Seeding cells whose last job is not `completed`; a normal provision or retry already runs the seed stage.

## 4. Actors And Permissions

| Context              | Actor               | Required capability                  | Required state                                       | Result                     |
| -------------------- | ------------------- | ------------------------------------ | ---------------------------------------------------- | -------------------------- |
| Cells screen, status | Operator            | `NAP::admin-tenancy::control::read`  | Any                                                  | Sees rollout status        |
| `cell-seed`          | Operator            | `NAP::admin-tenancy::control::write` | Last job `completed`; registry reason `SEED_MISSING` | `seed` job queued          |
| `cell-seed`          | Operator            | `NAP::admin-tenancy::control::write` | Any other state                                      | `409 INVALID_STATE`        |
| `reference-rollout`  | Operator            | `NAP::admin-tenancy::control::write` | Any                                                  | Queues every eligible cell |
| `cell-retry`         | Operator            | `NAP::admin-tenancy::control::write` | `seed` job `failed`                                  | Requeued, same action      |
| Any of the above     | Operator without it | —                                    | —                                                    | `403`                      |
| `seed` job           | Provisioning worker | Trusted in-process runner context    | Claimed job                                          | Runs seed, then activation |

## 5. Concepts And Terminology

| Term             | Meaning                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| Declared version | The seed version the running API's reference-data module declares (M0004-R004)                      |
| Eligible cell    | A cell whose last job is `completed` and whose runtime cell registry (I0003) reports `SEED_MISSING` |
| Seed job         | A cell's `admin.cell_provisioning` row with `requested_action = seed`                               |
| Rollout          | Queuing seed jobs for every eligible cell in one request                                            |

## 6. Functional Requirements

### Job

- I0007-R001: `admin.cell_provisioning.requested_action` must also allow `seed`, through a new admin-tenancy migration.
- I0007-R002: The worker must run a `seed` job as the seed stage (I0003-R009) followed by the activation stage (I0003-R010), and must not run setup or migration.
- I0007-R003: Activation of a `seed` job must reuse the cell's saved connection. Publishing the same connection again must not count as a `PUBLISH_CONFLICT` (I0003-R012).
- I0007-R004: A `seed` job completes only when the registry reports the cell ready after the seed. A cell still missing the declared version fails activation with `SEED_MISSING`.
- I0007-R005: A failed `seed` job must keep `requested_action = seed` when retried (M0001-06-R003), so retry reruns only seed and activation.

### Operations

- I0007-R006: `POST /control/provision` must accept `{ "operation": "cell-seed", "cell": "<uuid>" }`. It must queue a `seed` job at stage `seed` for an eligible cell, and return the queued job. A cell whose job is already `queued` or `running` returns that job unchanged. Any other cell returns `409 INVALID_STATE`.
- I0007-R007: `POST /control/provision` must accept `{ "operation": "reference-rollout" }`. It must queue a `seed` job for every eligible cell, each in its own transaction, and return `{ declaredVersion, queued: [<cell-id>], skipped: [{ cell, reason }] }`. `skipped` lists cells reporting `SEED_MISSING` that were not queued: `ALREADY_QUEUED` for a job already `queued` or `running`, or the error code when queuing failed. One cell's failure must not stop the others.
- I0007-R008: Each queued `seed` job must record a managed event naming the cell and the declared version. A rollout also records one event with the queued and skipped counts.

### Status

- I0007-R009: `GET /control/overview` must return `referenceSeed: { declaredVersion, current, missing, queued, running, failed }`, counting cells by seed state. `missing` counts eligible cells not yet queued.
- I0007-R010: Each cell in the overview must carry `seedState`: `current`, `missing`, `queued`, `running`, `failed`, or `unknown` (the registry does not hold the cell or reports another not-ready reason).

### Cells screen

- I0007-R011: The Cells screen must show a rollout panel with the declared version and the R009 counts. The panel shows only when any count other than `current` is nonzero.
- I0007-R012: The panel must offer **Roll out reference data** when `missing` is above zero. It asks for confirmation naming the version and cell count, then calls R007 and reports queued and skipped cells.
- I0007-R013: Each row must show its `seedState`, and its menu must offer **Load reference data** for an eligible cell, calling R006.
- I0007-R014: A failed `seed` job's row must show its failure code and offer the existing **Retry** (I0003-R031 shows the next action).
- I0007-R015: The screen must refresh while any `seed` job is `queued` or `running`, as it does for provisioning (I0003-R030).

### Maintenance command

- I0007-R020: `npm run db:seed:rollout -- --env <dev|prod>` must, with maintenance credentials and no running API, retry every failed `seed` job, queue every eligible cell (R007), run the jobs, and print one JSON line with `declaredVersion`, `completed`, `failed`, and `skipped`. It exits nonzero when any cell fails. It exists because the Napsoft cell can itself be `SEED_MISSING`, and then no operator can reach the Cells screen. A running API sees the result after it restarts.

## 7. Business Rules And Invariants

- I0007-R016: Only an eligible cell may receive a `seed` job, so a rollout cannot take a serving cell out of service (application workflow).
- I0007-R017: A failed `seed` job leaves the cell disabled, as every failed job does (M0001-06-R006). The cell was already not serving tenants, so this changes no tenant's access.
- I0007-R018: Rerunning the seed at the declared version changes no data (M0004-R005), so retrying or queuing a cell twice is safe.

## 8. Lifecycle And State Transitions

| Starting state                              | Trigger                       | Result                                                 |
| ------------------------------------------- | ----------------------------- | ------------------------------------------------------ |
| `complete/completed`, reason `SEED_MISSING` | `cell-seed` or rollout        | `seed/queued`, `requested_action = seed`               |
| `seed/queued` (`seed`)                      | Worker claims the job         | `seed/running`                                         |
| `seed/running` (`seed`)                     | Seed passes                   | `activation/running`                                   |
| `activation/running` (`seed`)               | Activation passes; cell ready | `complete/completed`; cell enabled and ready           |
| `seed` or `activation`, `running` (`seed`)  | Step fails                    | Same stage, `failed`, failure code; cell disabled      |
| `failed` (`seed`)                           | `cell-retry`                  | `registered/queued`; worker runs seed, then activation |
| Any `running` (`seed`)                      | API stops or crashes          | Returned to `queued` on next start (I0003-R002, R005)  |
| `complete/completed`, ready or other reason | `cell-seed`                   | `409 INVALID_STATE`                                    |

Failure codes: `SEED_FAILED`, `SEED_MISSING`, `PUBLISH_FAILED`, and the
not-ready reasons in I0003-R015.

## 9. Data Requirements

No new table. One admin-tenancy migration widens the `requested_action` check
to `('provision', 'activate', 'seed')` (R001). The worker writes
`reference.countries`, `reference.currencies`, and `reference.seed_versions`
through M0004's seed step, and `admin.cell_provisioning` and `admin.cells`
through M0001-06's operations.

Seed state is derived from the job row and the registry; it is not stored.

## 10. API Requirements

Base: `/api/admin-tenancy/v1`.

| Method and route          | Change                                                      | Capability                           | Errors                                                           |
| ------------------------- | ----------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------- |
| `POST /control/provision` | Adds `cell-seed` (R006) and `reference-rollout` (R007)      | `NAP::admin-tenancy::control::write` | `400 INVALID_INPUT`, `403`, `404 NOT_FOUND`, `409 INVALID_STATE` |
| `GET /control/overview`   | Adds `referenceSeed` (R009) and per-cell `seedState` (R010) | `NAP::admin-tenancy::control::read`  | `403`                                                            |

## 11. Cross-Module Interactions

- M0004 owns the snapshot, the seed step, the declared version, and `SEED_MISSING`. This PRD runs the seed step unchanged.
- I0003 owns the worker, the stages, and the registry. This PRD adds a job plan and reads `readiness(cellId)` to find eligible cells.
- M0001-06 owns the job row, its transitions, retry, and cell events. The operations go through its domain functions.
- I0002 owns the Cells screen; this PRD adds R011–R015.

## 12. Security And Audit

- I0007-R019: Responses, events, and failure codes must not contain passwords, connection strings, or endpoints (M0001-06-R008, I0003-R039).

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                                                                 | Requirements                      |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| AC01      | On a `dev` stack with two cells seeded at version N, raising the declared version to N+1 and restarting leaves both cells not ready with `SEED_MISSING`, and the overview reports `missing: 2`. | I0007-R009, R010                  |
| AC02      | **Roll out reference data** queues both cells; with no restart, both reach `complete/completed`, record version N+1, and are ready; a user of each cell's tenant can select it again.           | I0007-R002–R004, R007, R012, R015 |
| AC03      | **Load reference data** on one eligible cell queues and completes only that cell; on a ready cell it returns `409 INVALID_STATE`.                                                               | I0007-R006, R013, R016            |
| AC04      | A seed job whose seed step fails shows `SEED_FAILED` on its row with the cell disabled; after the cause is fixed, **Retry** runs seed and activation only and the cell becomes ready.           | I0007-R005, R014, R017            |
| AC05      | A second rollout while jobs are queued lists those cells as skipped with `ALREADY_QUEUED`; one after they complete queues nothing. Rerunning a completed seed changes no reference rows.        | I0007-R007, R018                  |
| AC06      | A `seed` job does not run setup or migration and does not fail with `PUBLISH_CONFLICT` for its own saved connection.                                                                            | I0007-R002, R003                  |
| AC07      | Each queued job and each rollout records a managed event; no response, event, or failure code contains a secret or endpoint.                                                                    | I0007-R008, R019                  |
| AC08      | An operator without `control::write` gets `403` from both operations and sees no rollout actions; one with only `control::read` sees the panel and row states.                                  | I0007-R006, R007, R011–R013       |
| AC09      | The admin migration accepts `seed` in `requested_action`; the check still rejects other values.                                                                                                 | I0007-R001                        |
| AC10      | With the Napsoft cell missing the declared version, `db:seed:rollout` loads it and the cell becomes ready.                                                                                      | I0007-R020                        |

## 14. Implementation Notes

- **Job:** migration `002-cell-seed-action` widens the `requested_action` check. `PLANS.seed` in `application/provisioning/worker.js` runs seed, then activation.
- **Starting jobs:** `startOperation` in `domain/cells.js` starts a retried `activate` or `seed` job at its first stage, so retry works from `registered`. This also fixed retry of a failed `activate` job, which previously failed to start with `INVALID_STATE`.
- **Failed seed jobs:** the failed transition in `advanceCellProvisioning` sets `enabled = false` for a `seed` job (R017), because a seed job runs on an enabled cell.
- **Operations:** `seedCell` and `rolloutReferenceData` read eligibility from the registry's `readiness`. The registry exposes `seedVersion`, so the admin-tenancy domain does not import reference-data.
- **Events:** `cell.seed.requested` and `reference.rollout.requested` are in the event catalogue, with detail keys `seed_version`, `queued`, and `skipped`.
- **Overview:** `seedState` and `referenceSeed` come from `seedStateOf`. Counts use `CellProvisioning.listStates()` across all cells.
- **Web:** the Cells screen adds the rollout panel with confirmation, a "Reference data" column, and **Load reference data**.
- **Maintenance command:** `db:seed:rollout` (R020) is in `application/maintenance/seedRollout.js`.
- **Verified:**
  - Tests pass: API unit (546), web (158), and database (241, local fixture).
  - `db:migrate:admin` applied `002` to the `dev` admin database.
  - `db:seed:rollout -- --env dev` ran against the `dev` stack and found nothing to update.
- **Browser check on the `dev` stack:** registered `nap_dev_cell_rollout` and deleted its `reference.seed_versions` row, then restarted the API. The Cells screen showed the panel with Missing 1. **Roll out reference data** confirmed, queued the cell, and the cell returned to current. The cell holds version 1, and its job is `seed`/`completed` with the cell enabled. Both events were recorded.

## 15. Outstanding Questions

- Should the worker queue `seed` jobs for eligible cells automatically at startup, instead of waiting for an operator? Automatic rollout shortens the outage after a release; operator-started rollout (this draft) matches the roadmap and lets an operator choose when each cell changes.
