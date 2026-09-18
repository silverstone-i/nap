# M0001-06: Cell Management

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Draft                                                                                                                                                                                                                                              |
| Type                 | Module work unit                                                                                                                                                                                                                                   |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)                                                                                                                                                                                                  |
| Owner                | To be confirmed                                                                                                                                                                                                                                    |
| Related architecture | [Admin and cells](../../../architecture/admin-cells.md), [Migrations](../../../architecture/migrations.md)                                                                                                                                         |
| Related PRDs         | [M0001-05: Authorization](M0001-05-authorization.md), [M0001-07: Tenant Creation](M0001-07-tenant-creation.md), [M0001-11: Cache Consistency](M0001-11-cache-consistency.md), [M0001-12: Administrative Events](M0001-12-administrative-events.md) |
| Related decisions    | None recorded separately; unresolved decisions are in section 14                                                                                                                                                                                   |
| Last reviewed        | 2026-09-18                                                                                                                                                                                                                                         |

## 2. Purpose

Register cells and persist requested provisioning work, progress, and failures
so operators can manage the central cell registry independently of physical
cell provisioning.

## 3. Scope

### Included

- Cell registry and provisioning-operation schemas, models, and repositories.
- Registration, central disable state, progress inspection, and retry requests.
- The interface through which a provisioning runner reports results.

### Excluded

- Physical database creation, migration, seeding, verification, and activation execution.
- Runtime connection management and physical readiness checks.
- Tenant assignment and cell-side records.

## 4. Actors And Permissions

| Context                              | Actor               | Required authority or state                           | Result                               |
| ------------------------------------ | ------------------- | ----------------------------------------------------- | ------------------------------------ |
| Register or disable cell             | Operator            | Matching platform capability from unit 5              | Apply valid registry operation       |
| Inspect registry or progress         | Operator            | Matching read capability                              | Return authorized central state      |
| Request retry                        | Operator            | Matching capability and eligible operation state      | Record retry against existing target |
| Report progress or activation result | Provisioning runner | Trusted workflow context for the registered operation | Apply validated record transition    |
| Mutate registry without a grant      | Portal user         | No matching capability                                | Deny                                 |

Capability keys and repeated-command rules remain open in Q01 and Q03.

## 5. Concepts And Terminology

| Term                   | Meaning                                                                  |
| ---------------------- | ------------------------------------------------------------------------ |
| Cell                   | Registered physical database identified by a stable UUID                 |
| Provisioning operation | Central record of work requested for one registered cell                 |
| Enabled                | Central flag allowing use subject to runtime readiness                   |
| Ready                  | Runtime assessment that the registered database can safely serve traffic |
| Retry                  | Resume work for the existing registered cell and operation               |

## 6. Functional Requirements

- M0001-06-R001: Registration must lock central control changes, validate the cell name, create a disabled `admin.cells` record and queued `admin.cell_provisioning` record, and return the cell UUID.
- M0001-06-R002: Provisioning records must expose the registered target, current stage, status, and failure reason to authorized callers.
- M0001-06-R003: A retry request must retain the existing cell UUID and provisioning operation identity.
- M0001-06-R004: Disabling a cell must set its central enabled flag to false without deleting the database or registry record.

## 7. Business Rules And Invariants

- M0001-06-R005: Each provisioning operation must retain its cell UUID, database name, environment, and operation identity across progress changes.
- M0001-06-R006: Failed provisioning must leave the cell disabled and record the failure; completion and enabling must require a successful activation result under the agreed runner contract.
- M0001-06-R007: Enabled state must not be presented as proof of runtime readiness.

The module validates central transitions. W0002: Cell Provisioning owns the
physical evidence and execution behind activation. Progress update concurrency
and registration transaction boundaries remain open in Q03.

## 8. Lifecycle And State Transitions

| Starting condition        | Trigger                  | Central result                            |
| ------------------------- | ------------------------ | ----------------------------------------- |
| Unregistered              | Valid registration       | Disabled cell and queued operation        |
| Queued or in progress     | Runner reports progress  | Same target with updated stage/status     |
| Unfinished                | Runner reports failure   | Disabled cell and recorded failure        |
| Failed and retry-eligible | Authorized retry request | Same operation requested for further work |
| Activation succeeds       | Trusted runner result    | Enabled cell and completed operation      |
| Enabled                   | Authorized disable       | Disabled record; database retained        |

Exact stored status values, retry eligibility, repeated disable, and manual
re-enable behavior remain open in Q02–Q03.

## 9. Data Requirements

| Table                     | Contract fields                                                                               | Access and sensitivity                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `admin.cells`             | `id` as stable UUID, expected database name, `enabled` flag                                   | Lookup by UUID; central infrastructure metadata                           |
| `admin.cell_provisioning` | Cell reference, database name, environment, operation identity, stage, status, failure reason | Find queued work or inspect a cell's operation; sensitive failure details |

Target relationships are module-owned constraints. Name uniqueness, operation
cardinality, timestamps, failure representation, and retention require Q01–Q03.
Connection credentials are not established as registry fields.

## 10. API Requirements

Existing architecture routes are retained:

| Method and route                                   | Input                                                    | Central responsibility                                               |
| -------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------- |
| `POST /api/admin-tenancy/v1/control/registry`      | `{ "operation": "cell", "suffix": "east" }`              | Register; return cell ID                                             |
| `POST /api/admin-tenancy/v1/control/provision`     | `{ "operation": "cell-retry", "cell": "<cell-uuid>" }`   | Request retry of the existing operation                              |
| `POST /api/admin-tenancy/v1/control/provision`     | `{ "operation": "cell-disable", "cell": "<cell-uuid>" }` | Persist disabled state                                               |
| `GET /api/admin-tenancy/v1/control/overview`       | Agreed read filters                                      | Supply central records and provisioning state                        |
| `GET /api/admin-tenancy/v1/control/cell-readiness` | `cell=<cell-uuid>`                                       | Readiness integration; physical checks belong to the runtime service |

Responses, errors, duplicate submission, and the runner's update interface remain
open in Q03. Overview combines central and runtime data; readiness checks are
verified in the receiving infrastructure deliverable, not claimed by registry tests.

## 11. Cross-Module Interactions

W0002: Cell Provisioning consumes queued operations and reports results.
Physical creation, migrations, identity checks, seeding, and activation are
tracked separately in the roadmap. This unit supplies a complete persistence
and command contract testable with runner-result fixtures.

Later tenant-assignment integration consumes enabled registry records;
[M0001-07: Tenant Creation](M0001-07-tenant-creation.md) has no cell-registry dependency.
[M0001-11: Cache Consistency](M0001-11-cache-consistency.md) owns routing-cache invalidation. Control-command cell IDs identify an
operator target; they do not override session-derived tenant routing.

## 12. Security And Audit

- M0001-06-R008: Registry responses, failure records, and events must exclude database connection secrets.

[M0001-12: Administrative Events](M0001-12-administrative-events.md) defines registration, retry, disable, and provisioning-result events.
Who can report runner results and read detailed failures is part of Q03.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                        | Requirements                                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC01      | Registration in an admin-only test creates a disabled cell and queued operation under the control lock and returns its UUID.                           | M0001-06-R001                                                                                                                                          |
| AC02      | Authorized reads return central target, stage, status, and failure data.                                                                               | M0001-06-R002                                                                                                                                          |
| AC03      | Retry and progress updates retain all registered target identifiers.                                                                                   | M0001-06-R003, M0001-06-R005                                                                                                                           |
| AC04      | Disable retains the cell record and does not request physical deletion.                                                                                | M0001-06-R004                                                                                                                                          |
| AC05      | Failure fixtures leave the cell disabled; invalid or premature completion is rejected; an accepted activation result permits completion.               | M0001-06-R006                                                                                                                                          |
| AC06      | Registry enabled state and supplied runtime readiness remain distinguishable.                                                                          | M0001-06-R007                                                                                                                                          |
| AC07      | Stored failure details and exposed records contain no connection secrets.                                                                              | M0001-06-R008                                                                                                                                          |
| AC08      | Applicable source mutations invalidate their cached decisions and record the required catalogue events; failures follow the accepted shared contracts. | [M0001-11-R002](M0001-11-cache-consistency.md#6-functional-requirements), [M0001-12-R001](M0001-12-administrative-events.md#6-functional-requirements) |

Physical activation requires separate W0002 integration evidence.

## 14. Open Questions

| ID  | Decision required before acceptance                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------- |
| Q01 | What suffix/database-name validation, uniqueness, and platform capabilities apply?                                |
| Q02 | What operation states, retry gates, re-enable rules, and record retention apply?                                  |
| Q03 | What API and runner-update schemas, trust checks, atomicity, concurrency, idempotency, and error contracts apply? |
