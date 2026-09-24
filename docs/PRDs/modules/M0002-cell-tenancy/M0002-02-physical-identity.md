# M0002-02: Physical Identity

## 1. Document Control

| Field                | Value                                                                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Implemented                                                                                                                                                 |
| Type                 | Module Work Unit                                                                                                                                            |
| Family               | [M0002: Cell Tenancy](../M0002-cell-tenancy.md)                                                                                                             |
| Related architecture | [Module design](../../../architecture/module-design.md), [Admin and cells](../../../architecture/admin-cells.md)                                            |
| Related PRDs         | [M0002-01: Cell Database Foundation](M0002-01-cell-database-foundation.md), [M0001-06: Cell Management](../M0001-admin-tenancy/M0001-06-cell-management.md) |
| Related decisions    | Cell provisioning, not this Work Unit, writes `cell.physical_identity`                                                                                      |
| Last reviewed        | 2026-09-24                                                                                                                                                  |

## 2. Purpose

Refuse to serve tenant traffic from a cell database whose physical identity
does not match its registration. A cell can be misconfigured, cloned, or
pointed at the wrong database by mistake; this Work Unit catches that before
any tenant row is read or written.

## 3. Scope

### Included

- A verification function that reads the single row in `cell.physical_identity`
  and compares it against the cell's `admin.cells` record and `SELECT
current_database()` on that connection.
- The distinct not-ready reasons the check can report.

### Excluded

- Writing `cell.physical_identity`. Cell provisioning writes the row once,
  during setup, using the cell ID, database name, operation ID, and
  environment already recorded in `admin.cells` and `admin.cell_provisioning`
  (M0001-06). Provisioning has no PRD yet (see the parent document's Out of
  scope section).
- Loading cell connections, building the runtime registry, and routing
  requests (W0001). W0001 calls this Work Unit's check for each
  configured cell before adding it to the registry.
- Health checks and hot add. No workflow PRD yet (see the parent document's
  Out of scope section).
- Any change to `admin.cells` or `admin.cell_provisioning`.

## 4. Actors And Permissions

No new actor. The runtime cell registry (W0001) calls it in-process while
loading a cell connection. It exposes no HTTP route.

## 5. Concepts And Terminology

| Term              | Meaning                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| Identity row      | The single row in `cell.physical_identity`, written once by provisioning                                 |
| Central record    | The cell's row in `admin.cells`: its ID, database name, environment, and enabled flag                    |
| Identity mismatch | The identity row names a different cell than the one being loaded                                        |
| Database mismatch | The identity row's database name disagrees with the central record or with the connection's own database |
| Not ready         | A cell that has failed this check and must not serve any tenant request                                  |

## 6. Functional Requirements

- M0002-02-R001: The module must export a function that takes a connected cell
  handle and the cell's `admin.cells` record, reads `cell.physical_identity`,
  and returns whether the cell is ready, with a reason code when it is not.
- M0002-02-R002: The check must confirm all three agree: the identity row's
  `cell_id` equals the `admin.cells` record's ID, the identity row's
  `database_name` equals the value `SELECT current_database()` returns on the
  cell connection, and the `admin.cells` record's own database name equals the
  identity row's `database_name`.
- M0002-02-R003: A `cell.physical_identity` table with no row must fail the
  check with a reason distinct from a mismatched row.
- M0002-02-R004: The check must not query `cell.tenants`, `cell.tenant_members`,
  `cell.module_entitlements`, or `cell.outbox`, and must not run when any of
  the three values in R002 is unavailable.

## 7. Business Rules And Invariants

- M0002-02-R005: The check is read-only. It must not write to
  `cell.physical_identity` or `admin.cells`.
- M0002-02-R006: The check runs once, when a cell connection is loaded
  (startup or hot add). It does not run again on a per-request or
  per-transaction basis; a cell that has passed it is trusted for the life of
  that connection.
- M0002-02-R007: A cell that fails the check must not enter the runtime
  registry. No route reachable through that connection may run.

## 8. Lifecycle And State Transitions

| Starting state                                                                           | Action | Result                         |
| ---------------------------------------------------------------------------------------- | ------ | ------------------------------ |
| Identity row's `cell_id`, `database_name` match `admin.cells` and `current_database()`   | Check  | Ready                          |
| Identity row names a different `cell_id`                                                 | Check  | Not ready; `IDENTITY_MISMATCH` |
| Identity row's `database_name` disagrees with `current_database()` or with `admin.cells` | Check  | Not ready; `DATABASE_MISMATCH` |
| `cell.physical_identity` has no row                                                      | Check  | Not ready; `IDENTITY_MISSING`  |

## 9. Data Requirements

No schema change. This Work Unit reads `cell.physical_identity` (defined in
M0002-01) and the cell's own row in `admin.cells` (defined in M0001-00,
populated by M0001-06). It writes to neither.

## 10. API Requirements

No HTTP route and no package command. The module exposes one function for the
runtime cell registry to call:

```js
verifyPhysicalIdentity(cellHandle, adminCellRecord);
// → { ready: true }
// → { ready: false, reason: 'IDENTITY_MISMATCH' | 'DATABASE_MISMATCH' | 'IDENTITY_MISSING' }
```

## 11. Cross-Module Interactions

- Cell provisioning (future PRD, not owned by this module) writes
  `cell.physical_identity` once, during setup, before this check ever runs
  against that cell.
- W0001 calls `verifyPhysicalIdentity` for each configured cell before
  adding it to the runtime registry, and treats a failed check the same as an
  unreachable cell for that cell's tenants only.
- The future cell health and hot-add workflow (no PRD yet) will call it again
  when hot-adding a cell registered after startup.
- Reads `admin.cells` (M0001-06); never writes to it.

## 12. Security And Audit

- M0002-02-R008: A not-ready result must carry only the reason code in section
  8, never the compared values, connection strings, or credentials.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                         | Requirements                 |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| AC01      | A cell whose identity row, `admin.cells` record, and `current_database()` all agree is ready.                                           | M0002-02-R001, M0002-02-R002 |
| AC02      | A cell whose identity row names a different `cell_id` is not ready with `IDENTITY_MISMATCH`, and no tenant table is queried.            | M0002-02-R002, M0002-02-R004 |
| AC03      | A cell whose identity row's `database_name` disagrees with `current_database()` or `admin.cells` is not ready with `DATABASE_MISMATCH`. | M0002-02-R002                |
| AC04      | A cell with no identity row is not ready with `IDENTITY_MISSING`, distinct from a mismatch.                                             | M0002-02-R003                |
| AC05      | The check never writes to `cell.physical_identity` or `admin.cells`, and a not-ready result carries no compared value or credential.    | M0002-02-R005, M0002-02-R008 |

### Verification Evidence

Local validation on 2026-09-24: `npm run lint`, `npm run format:check`,
`npm test` (552 tests across the workspace), `npm run build`,
`npm run licenses`, and `git diff --check` passed. `npm run test:db:local`
passed all 179 tests against a disposable local PostgreSQL 18 server,
including the 8 new
[cell physical identity tests](../../../../apps/api/tests/integration/cell-physical-identity.test.js).

Those tests cover a matching identity row, database, and `admin.cells`
record (AC01); a wrong `cell_id` (AC02); a `database_name` that disagrees
with `admin.cells` and, separately, one that disagrees with the connection's
own `current_database()` (AC03); no identity row at all (AC04); and that a
not-ready result leaves the row untouched and carries only `ready`/`reason`,
no compared value or credential (AC05).

One design point worth recording: `verifyPhysicalIdentity` throws instead of
returning a reason code when `cellHandle` is missing its `db`, or
`adminCellRecord` is missing `id` or `database_name`. The PRD's three reason
codes describe data conditions found in the cell's own tables; a malformed
caller argument is a contract violation, not one of those conditions, so both
guards follow the same `requireCondition` convention `verifyCell` uses for
invariant violations rather than being folded into the
`{ ready: false, reason }` shape.

The identity row read uses `db.physical_identity.findOneBy({}, { columnWhitelist: [...] })`
rather than `findOneBy([], ...)`: both produce the same query — no
conditions means no `WHERE` clause — but every other `findOneBy` call in the
codebase passes a plain object, and matching that convention was worth the
one-character change (caught in review by
[Copilot](https://github.com/silverstone-i/nap/pull/27#discussion_r4090231849)).

## 14. Outstanding Questions

None.
