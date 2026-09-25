# M0001-06: Cell Management

## 1. Document Control

| Field                | Value                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| Status               | Implemented                                                                                                |
| Type                 | Module Work Unit                                                                                           |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)                                                          |
| Related architecture | [Admin and cells](../../../architecture/admin-cells.md), [Migrations](../../../architecture/migrations.md) |
| Related PRDs         | [M0001-05](M0001-05-authorization.md), [M0001-12](M0001-12-administrative-events.md)                       |
| Related decisions    | None                                                                                                       |
| Last reviewed        | 2026-09-21                                                                                                 |

## 2. Purpose

Register cells and track their physical provisioning without creating the cell
database inside an HTTP request.

## 3. Scope

### Included

- Cell registration, retry requests, disable operations, and central status.
- Trusted progress updates from the provisioning runner.
- Operator overview and readiness integration.

### Excluded

- Admin table definitions and migrations.
- Physical database setup, migration, seed, and activation.
- Tenant assignment and cell-local records.

## 4. Actors And Permissions

| Actor                         | Authority                         | Result                                                          |
| ----------------------------- | --------------------------------- | --------------------------------------------------------------- |
| Root user or `platform_admin` | `admin-tenancy::control::write`   | Register, retry, or disable any cell                            |
| `support`                     | Same capability                   | Perform the operation unless it would affect the Napsoft tenant |
| Provisioning runner           | Trusted in-process runner context | Update the current operation's stage and outcome                |
| Authorized operator           | `admin-tenancy::control::read`    | Read overview and readiness                                     |

## 5. Concepts And Terminology

| Term              | Meaning                                                                 |
| ----------------- | ----------------------------------------------------------------------- |
| Cell suffix       | Lowercase name used to derive the environment-specific database name    |
| Operation ID      | Stable UUID retained across retries                                     |
| Runtime readiness | The loaded connection has passed database-name, schema, and seed checks |

## 6. Functional Requirements

- M0001-06-R001: Registration must create a disabled cell and queued provisioning operation in one transaction and return both UUIDs.
- M0001-06-R002: Authorized reads must report the target, stage, status, attempts, timestamps, and safe failure code.
- M0001-06-R003: Retry must reuse the cell UUID and operation UUID and increment the attempt count.
- M0001-06-R004: Disable must set `enabled = false` without deleting the registry record or physical database.

## 7. Business Rules And Invariants

- M0001-06-R005: Environment, database name, cell UUID, and operation UUID cannot change after registration.
- M0001-06-R006: Failure leaves the cell disabled; only a successful activation result may enable it.
- M0001-06-R007: The central enabled flag is not proof of runtime readiness.

Suffixes contain 1–32 lowercase ASCII letters, numbers, or hyphens, starting
and ending with a letter or number (never a hyphen). Database names use
`nap_<environment>_cell_<suffix>` and must fit PostgreSQL's 63-byte limit.
Environment and database name are unique among unarchived cells.

Registration and runner updates lock the operation row. Retry is allowed only
from `failed`; a repeated retry while `queued` or `running` returns the current
operation. A completed operation cannot be retried. A disabled cell can be
enabled only by a new successful activation check.

## 8. Lifecycle And State Transitions

| State             | Action           | Result                                       |
| ----------------- | ---------------- | -------------------------------------------- |
| Not registered    | Register         | Disabled cell; `registered/queued` operation |
| Queued            | Runner starts    | `setup/running`; attempts incremented        |
| Running           | Runner advances  | Next stage remains `running`                 |
| Running           | Runner fails     | Current stage, `failed`, safe failure code   |
| Failed            | Retry            | `registered/queued`, same IDs                |
| Activation passes | Runner completes | `complete/completed`; cell enabled           |
| Enabled           | Disable          | Cell disabled; physical database preserved   |

## 9. Data Requirements

This Work Unit uses `admin.cells` and `admin.cell_provisioning`. M0001-00 defines
their schema. Neither table stores a password, connection string, or provider secret.

## 10. API Requirements

| Method and route                                            | Input                                 | Result                              |
| ----------------------------------------------------------- | ------------------------------------- | ----------------------------------- |
| `POST /api/admin-tenancy/v1/control/registry`               | `{ operation: "cell", suffix }`       | `201` with cell and operation UUIDs |
| `POST /api/admin-tenancy/v1/control/provision`              | `{ operation: "cell-retry", cell }`   | `200` current queued operation      |
| `POST /api/admin-tenancy/v1/control/provision`              | `{ operation: "cell-disable", cell }` | `200` disabled registry view        |
| `GET /api/admin-tenancy/v1/control/overview`                | Cursor and limit                      | Central cell and provisioning views |
| `GET /api/admin-tenancy/v1/control/cell-readiness?cell=:id` | Cell UUID                             | Central and runtime readiness view  |

Duplicate suffix or database name returns `409 CONFLICT`; invalid input returns
`400 INVALID_INPUT`; unknown cells return `404`; invalid transitions return
`409 INVALID_STATE`. The runner uses an internal method, not a public HTTP route.

## 11. Cross-Module Interactions

The provisioning infrastructure performs setup, migration, seed, and activation,
including [durable connection publication and live pool loading](../../../architecture/admin-cells.md#provisioning-and-activation).
UI registration requires neither a preconfigured cell endpoint nor an operator restart.
M0001-07 may assign tenants only after a separate assignment operation verifies
the cell is enabled. Runtime readiness remains an infrastructure result.

## 12. Security And Audit

- M0001-06-R008: Responses, failures, logs, and events must omit database credentials and provider secrets.

Register, retry, progress failure, completion (which enables the cell), and disable record managed
events. Support cannot disable a cell containing the Napsoft tenant.

## 13. Acceptance Criteria

| Criterion | Required result                                                                         | Requirements                                |
| --------- | --------------------------------------------------------------------------------------- | ------------------------------------------- |
| AC01      | Valid registration creates one disabled cell and one queued operation atomically.       | M0001-06-R001, M0001-06-R005                |
| AC02      | Overview and readiness return safe central state and distinguish runtime readiness.     | M0001-06-R002, M0001-06-R007                |
| AC03      | Failure, retry, completion, and disable follow the stated transitions and preserve IDs. | M0001-06-R003, M0001-06-R004, M0001-06-R006 |
| AC04      | Concurrent requests do not create duplicate cells or advance an operation twice.        | M0001-06-R001, M0001-06-R003                |
| AC05      | No response, failure, log, or event reveals a connection or provider secret.            | M0001-06-R008                               |

### Verification Evidence

Local validation on 2026-09-20: `npm run lint`, `npm run format:check`,
`npm test` (294 tests in the API workspace, including 12 new unit tests),
`npm run build`, `npm run licenses`, and `git diff --check` passed.

`npm run test:db` passed 115 of 117 tests against a disposable local
PostgreSQL 18 server, including all 25
[cell-management tests](../../../../apps/api/tests/integration/cell-management.test.js).
The two failures are in `admin-foundation.test.js` and predate this Work
Unit: the local fixture server authenticates with `trust`, so the
wrong-password cases those tests rely on still connect. Neither touches
`admin.cells` or `admin.cell_provisioning`.

Integration tests cover atomic registration (cell and operation together,
one row each, a queued event) and its duplicate-identity conflict; retry from
`failed` (same cell and operation UUIDs, `attempts + 1`, cleared failure
state), its idempotent no-op while `queued` or `running`, its refusal once
`completed`, and exactly one attempt advancing under two concurrent retries
(AC04); disable, idempotent and non-destructive; the full runner-trusted
lifecycle (`started` → `advanced` × 3 → `completed`, enabling the cell only
at the end) and a `failed` transition recording a safe failure code without
enabling the cell, plus rejection of an out-of-order transition
(`INVALID_STATE`); support's Napsoft restriction on retry and disable, and
its absence from registration, which has no tenant yet; overview pagination
pairing each cell with its own operation and advancing the cursor; readiness
distinguishing the central `enabled` flag from an honestly-unwired runtime
result; and that no cell event carries a credential, connection, or secret
string (AC05).

Unit tests cover suffix, environment, and database-name validation; control
authority derivation from a capability; and the four routes against an
in-memory admin handle: session and capability gating, request validation,
the `INVALID_STATE` → `409` mapping, and each route's success shape.

Three design points worth recording for a reader comparing this
implementation to the PRD text:

- `environment` is never read from the registration request body. It comes
  from the running API's own configuration (threaded through
  `runtimeConfiguration()` → `server.js` → `app.js` → the `control` router),
  since §10's request shape (`{ operation: "cell", suffix }`) has no
  `environment` field and a client must not be able to pick it.
- §8's lifecycle table reads "attempts incremented" on the runner's own
  start transition, but M0001-06-R003 states plainly that retry increments
  the attempt count, and AC03 cites R003 directly. Since this Work Unit does
  not build the runner (only the internal method a future one will call),
  `retryCellProvisioning` performs the increment itself; the trusted
  `started` transition does not increment a second time. This is the reading
  that makes R003/AC03 demonstrable from what this Work Unit actually ships.
- `getCellReadiness` reports runtime readiness through an optional
  collaborator that nothing yet supplies, so it honestly answers
  `{ ready: false, checked: false }` rather than fabricating a pass.
  [I0003: Cell Provisioning](../../inter-module-workflows/I0003-cell-provisioning.md)
  (Implemented) now supplies the `runtime.readiness(cellId)` collaborator. Building
  the registry is infrastructure work this PRD excludes ("Physical database setup, migration, seed, and activation");
  Cross-Module Interactions confirms "Runtime readiness remains an
  infrastructure result."

Re-verified 2026-09-21, moving this Work Unit from `Accepted` to
`Implemented`: `npm run lint`, `npm run format:check`, `npm test` (382 unit
tests across the workspace), `npm run build`, and `npm run licenses` still
pass, and `npm run test:db` passes all 158 tests against a disposable local
PostgreSQL 18 server configured with real password authentication —
including all 37 cell-management tests (12 unit, 25 integration). The two
`admin-foundation.test.js` failures noted above on 2026-09-20 do not
reproduce with a correctly authenticating fixture: they were an artifact of
that session's disposable server using `trust` authentication (which accepts
any password, defeating the two wrong-password test cases), not a defect in
this or any other Work Unit.

**2026-09-22 rule amendment:** §7's suffix rule no longer requires the first
character to be a letter — a digit-led suffix (`1`, `1east`) is now valid,
so `nap_dev_cell_1` is a legitimate database name. The end-of-string
constraint is unchanged (still a letter or digit, never a trailing hyphen).
Prompted by I0002's Register-cell dialog rejecting `1` with a message that
didn't explain why. `parseSuffix` (`domain/cells.js`) and its unit test
(`tests/unit/cell-management.test.js`) were updated accordingly; `npm test`
(533 tests across the workspace) and `npm run test:db:local` (165 tests)
both still pass in full.

## 14. Outstanding Questions

None.
