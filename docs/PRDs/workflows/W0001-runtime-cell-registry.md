# W0001: Runtime Cell Registry And Routing

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Draft                                                                                                                                                                                                                                                                                                                |
| Type                 | Workflow                                                                                                                                                                                                                                                                                                             |
| Related architecture | [Admin and cells](../../architecture/admin-cells.md), [BFF](../../architecture/bff.md)                                                                                                                                                                                                                               |
| Related PRDs         | [M0002-02: Physical Identity](../modules/M0002-cell-tenancy/M0002-02-physical-identity.md), [M0001-06: Cell Management](../modules/M0001-admin-tenancy/M0001-06-cell-management.md), [M0001-09: Tenant Selection And Support Access](../modules/M0001-admin-tenancy/M0001-09-tenant-selection-and-support-access.md) |
| Related decisions    | The runtime connects to cells as `nap-app`; a cell that fails to load never stops API startup                                                                                                                                                                                                                        |
| Last reviewed        | 2026-09-24                                                                                                                                                                                                                                                                                                           |

## 2. Purpose

Give the API a connection to each cell database and a way to find the right
one for a tenant. Tenant selection (M0001-09) and the cell readiness route
(M0001-06) already ask a `runtime.readiness(cellId)` collaborator whether a
cell can serve traffic. Nothing supplies it today, so every tenant selection
returns `503 CELL_UNAVAILABLE`. This workflow supplies it.

It is infrastructure, not a module: it owns no table, and it exists because
the API — not any one module — needs one connection per cell, built once at
startup and shared by every module that serves a tenant request.

## 3. Scope

### Included

- Reading the configured cell connections from `CELL_DATABASES_<ENV>`.
- Loading each configured cell at startup: check it against `admin.cells`,
  connect as `nap-app`, and run the M0002-02 identity check.
- A runtime cell registry, keyed by cell ID, that holds each loaded
  connection and its readiness.
- Resolving the cell for a session's tenant.
- Passing the registry as the `runtime` collaborator to `selectTenant` and
  `getCellReadiness`.
- Closing every cell connection on shutdown.

### Excluded

- Rechecking cells after startup, returning a recovered cell to service, and
  adding a cell without a restart. No workflow PRD yet (see
  [M0002: Cell Tenancy](../modules/M0002-cell-tenancy.md)'s Out of scope
  section). Until then, a cell that fails to load stays unavailable until the
  API restarts.
- Opening tenant transactions and setting `nap.tenant_id` (tenant context; no PRD yet).
- Reporting identity and migration detail on the readiness route. No PRD yet
  (see [M0002: Cell Tenancy](../modules/M0002-cell-tenancy.md)'s Out of scope
  section).
- Saving a new cell's connection during provisioning. Cell provisioning has
  no PRD yet (see [M0002: Cell Tenancy](../modules/M0002-cell-tenancy.md)'s
  Out of scope section).
- Any write to `admin.cells`.

## 4. Actors And Permissions

No new actor or route. The API process builds the registry at startup, and
existing routes read it under their current authorization. Every runtime cell
connection uses the `nap-app` role.

## 5. Concepts And Terminology

| Term                  | Meaning                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| Cell configuration    | The `CELL_DATABASES_<ENV>` JSON map from cell ID to that cell's database endpoint                     |
| Runtime cell registry | The in-process map from cell ID to a loaded connection and its readiness                              |
| Ready cell            | A configured cell that is enabled in `admin.cells`, reachable, and passed the M0002-02 identity check |
| Not-ready reason      | The code that says why a cell is not ready                                                            |

## 6. Functional Requirements

- W0001-R001: Startup must read `CELL_DATABASES_<ENV>` as a JSON object whose keys are cell IDs. Local and test entries give an endpoint and use `NAP_APP_PSWD_<ENV>`; production entries give the endpoint and the `nap-app` password. A missing setting means no cells.
- W0001-R002: Malformed cell configuration (invalid JSON, a key that is not a UUID, or an entry with no valid endpoint) must stop startup with `INVALID_CONFIGURATION` naming the setting.
- W0001-R003: For each configured cell, startup must read its `admin.cells` record, connect as `nap-app`, confirm the connection works, and call `verifyPhysicalIdentity`. The cell is ready only if every step passes.
- W0001-R004: The registry must expose `readiness(cellId)`, returning `{ ready: true }` or `{ ready: false, reason }` with a reason from section 8. An ID the registry does not hold returns `CELL_NOT_CONFIGURED`.
- W0001-R005: The registry must expose `cellFor(session)`, which reads the session's tenant, finds its `cell_id` in `admin.tenants`, and returns that cell's connection when it is ready. Otherwise it throws `CELL_UNAVAILABLE`.
- W0001-R006: The API must pass the registry as the `runtime` collaborator to `selectTenant` and `getCellReadiness`.
- W0001-R007: Shutdown must close every cell connection, including those of cells that are not ready.

## 7. Business Rules And Invariants

- W0001-R008: A cell that fails to load must not stop startup or affect other cells. Admin routes and ready cells keep serving.
- W0001-R009: A cell that is not ready must not serve any tenant request. `cellFor` must never return its connection.
- W0001-R010: The browser never names a cell. `cellFor` takes the cell only from the session's tenant record (M0001-09-R006).
- W0001-R011: Startup must not run cell migrations (M0002-01-R010) and must not write to any cell or admin table.

## 8. Lifecycle And State Transitions

Each configured cell is checked once, at startup, in this order. The first
failing step sets the reason.

| Condition at startup                                      | Result                                                         |
| --------------------------------------------------------- | -------------------------------------------------------------- |
| Cell ID has no `admin.cells` record                       | Not ready; `CELL_NOT_REGISTERED`                               |
| `admin.cells` record is not enabled                       | Not ready; `CELL_DISABLED`                                     |
| Connection fails or times out                             | Not ready; `CELL_UNREACHABLE`                                  |
| Identity check fails                                      | Not ready; the M0002-02 reason                                 |
| Every step passes                                         | Ready                                                          |
| Enabled cell in `admin.cells` with no configuration entry | Not in the registry; `readiness` returns `CELL_NOT_CONFIGURED` |

A cell's state does not change after startup in this workflow. The cell
health and hot-add workflow (no PRD yet) adds rechecks.

## 9. Data Requirements

No schema change. Reads `admin.cells` and `admin.tenants` (M0001-00) and
`cell.physical_identity` through M0002-02. Writes nothing.

## 10. API Requirements

No new route. Two existing routes change behavior because they now receive
the registry:

| Route                                                         | Before                                               | After                                                                   |
| ------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| Tenant selection (M0001-09)                                   | Always `503 CELL_UNAVAILABLE`                        | Succeeds when the tenant's cell is ready; `503 CELL_UNAVAILABLE` if not |
| `GET /api/admin-tenancy/v1/control/cell-readiness` (M0001-06) | `runtime` reports `{ ready: false, checked: false }` | `runtime` reports the registry's `readiness(cellId)` result             |

The registry's in-process interface:

```js
registry.readiness(cellId);
// → { ready: true } | { ready: false, reason }
registry.cellFor(session);
// → cell connection, or throws CELL_UNAVAILABLE
registry.close();
```

## 11. Cross-Module Interactions

- Calls `verifyPhysicalIdentity` (M0002-02) for each configured cell.
- Reads `admin.cells` and `admin.tenants` owned by admin tenancy (M0001).
- Tenant context (no PRD yet) will call `cellFor` to open each tenant transaction.

## 12. Security And Audit

- W0001-R012: Passwords and connection strings must not appear in the registry's readiness results, errors, logs, or API responses. Startup errors name only the setting.
- W0001-R013: A not-ready result carries only its reason code, not the compared values or the cell's endpoint.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                                                        | Requirements                                   |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| AC01      | Startup with a valid map loads each configured cell; an absent setting starts with no cells.                                                                                           | W0001-R001, W0001-R003                         |
| AC02      | Invalid JSON, a non-UUID key, or an entry with no endpoint stops startup with `INVALID_CONFIGURATION` and no credential in the output.                                                 | W0001-R002, W0001-R012                         |
| AC03      | Each row of the section 8 table produces its stated reason from `readiness`.                                                                                                           | W0001-R003, W0001-R004, W0001-R013             |
| AC04      | With one ready cell and one unreachable cell, selecting a tenant in the ready cell succeeds and one in the unreachable cell returns `503 CELL_UNAVAILABLE`; admin routes still answer. | W0001-R005, W0001-R006, W0001-R008, W0001-R009 |
| AC05      | `cell-readiness` reports the registry result for a ready and a not-ready cell.                                                                                                         | W0001-R006                                     |
| AC06      | `cellFor` returns a connection only for a ready cell resolved from the session's tenant record.                                                                                        | W0001-R005, W0001-R009, W0001-R010             |
| AC07      | Startup runs no migration and writes nothing; shutdown closes every cell connection.                                                                                                   | W0001-R007, W0001-R011                         |

## 14. Outstanding Questions

None.
