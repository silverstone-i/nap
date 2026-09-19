# M0001-06: Cell Management

## 1. Document Control

| Field                | Value                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| Status               | Draft                                                                                                      |
| Type                 | Module Work Unit                                                                                           |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)                                                          |
| Related architecture | [Admin and cells](../../../architecture/admin-cells.md), [Migrations](../../../architecture/migrations.md) |
| Related PRDs         | [M0001-05](M0001-05-authorization.md), [M0001-12](M0001-12-administrative-events.md)                       |
| Related decisions    | None                                                                                                       |
| Last reviewed        | 2026-09-18                                                                                                 |

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

| Actor               | Authority                         | Result                                                          |
| ------------------- | --------------------------------- | --------------------------------------------------------------- |
| `platform_admin`    | `admin-tenancy::control::write`   | Register, retry, or disable any cell                            |
| `support`           | Same capability                   | Perform the operation unless it would affect the Napsoft tenant |
| Provisioning runner | Trusted in-process runner context | Update the current operation's stage and outcome                |
| Authorized operator | `admin-tenancy::control::read`    | Read overview and readiness                                     |

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

Suffixes contain 1–32 lowercase ASCII letters, numbers, or hyphens, start with a
letter, and end with a letter or number. Database names use
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

The provisioning infrastructure performs setup, migration, seed, and activation.
M0001-07 may assign tenants only after a separate assignment operation verifies
the cell is enabled. Runtime readiness remains an infrastructure result.

## 12. Security And Audit

- M0001-06-R008: Responses, failures, logs, and events must omit database credentials and provider secrets.

Register, retry, progress failure, completion, enable, and disable record managed
events. Support cannot disable a cell containing the Napsoft tenant.

## 13. Acceptance Criteria

| Criterion | Required result                                                                         | Requirements                                |
| --------- | --------------------------------------------------------------------------------------- | ------------------------------------------- |
| AC01      | Valid registration creates one disabled cell and one queued operation atomically.       | M0001-06-R001, M0001-06-R005                |
| AC02      | Overview and readiness return safe central state and distinguish runtime readiness.     | M0001-06-R002, M0001-06-R007                |
| AC03      | Failure, retry, completion, and disable follow the stated transitions and preserve IDs. | M0001-06-R003, M0001-06-R004, M0001-06-R006 |
| AC04      | Concurrent requests do not create duplicate cells or advance an operation twice.        | M0001-06-R001, M0001-06-R003                |
| AC05      | No response, failure, log, or event reveals a connection or provider secret.            | M0001-06-R008                               |

## 14. Outstanding Questions

None.
