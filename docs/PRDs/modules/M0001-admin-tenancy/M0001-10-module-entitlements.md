# M0001-10: Module Entitlements

## 1. Document Control

| Field                | Value                                                                            |
| -------------------- | -------------------------------------------------------------------------------- |
| Status               | Draft                                                                            |
| Type                 | Module work unit                                                                 |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)                                |
| Related architecture | [Module map](../../../architecture/module-map.md)                                |
| Related PRDs         | [M0001-05](M0001-05-authorization.md), [M0001-11](M0001-11-cache-consistency.md) |
| Related decisions    | None                                                                             |
| Last reviewed        | 2026-09-18                                                                       |

## 2. Purpose

Control which optional product modules each tenant may use.

## 3. Scope

### Included

- Central entitlement reads, grants, and withdrawals.
- The module catalogue used for validation.
- Source data for cell entitlement projection.

### Excluded

- Table definitions and migrations.
- Cell projection delivery and cell-side enforcement.
- Platform roles and tenant role assignments.

## 4. Actors And Permissions

| Actor            | Target             | Result                      |
| ---------------- | ------------------ | --------------------------- |
| `platform_admin` | Any tenant         | Read or change entitlements |
| `support`        | Non-Napsoft tenant | Read or change entitlements |
| `tenant_admin`   | Own tenant         | Read entitlements only      |
| Any actor        | Unknown module     | Reject                      |

## 5. Concepts And Terminology

| Term             | Meaning                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| Entitlement      | Central decision that an optional module is enabled for a tenant        |
| Mandatory module | Infrastructure module always available and not stored as an entitlement |
| Catalogue        | Fixed list of optional module names accepted by this API                |

## 6. Functional Requirements

- M0001-10-R001: The module must store one current entitlement per tenant and optional module.
- M0001-10-R002: Authorized callers must read one entitlement or list all entitlement states for a tenant.
- M0001-10-R003: Authorized callers must grant and withdraw optional module use idempotently.
- M0001-10-R004: Central changes must commit without a cell connection or projection result.

The optional catalogue is `business-directory`, `companies`, `catalog`,
`projects`, `cost-codes`, `estimating`, `scheduling`, `project-costs`, `sales`,
`contracts`, `accounting`, `accounts-payable`, and `accounts-receivable`.

`cell-tenancy`, `reference-data`, `access-control`, `tenant-settings`, and
`reporting` are mandatory infrastructure modules and do not have entitlement rows.

## 7. Business Rules And Invariants

- M0001-10-R005: Entitlements must reference an existing unarchived tenant and a module in the optional catalogue.
- M0001-10-R006: Entitlement changes must not grant platform roles, tenant roles, or user permissions.

An absent row means disabled. Grant creates the row or sets `enabled = true`.
Withdrawal sets `enabled = false`; it does not delete the row. Each actual state
change increments `revision`; repeating the current state returns it unchanged.
Concurrent changes lock the row, so the last committed request determines state.

## 8. Lifecycle And State Transitions

| State              | Action   | Result                                          |
| ------------------ | -------- | ----------------------------------------------- |
| Absent or disabled | Grant    | Enabled entitlement; revision increments        |
| Enabled            | Grant    | No change                                       |
| Enabled            | Withdraw | Disabled entitlement; revision increments       |
| Absent or disabled | Withdraw | Disabled result; no unnecessary row for absence |

## 9. Data Requirements

This work unit uses `admin.module_entitlements`. M0001-00 defines its schema and
tenant/module uniqueness.

## 10. API Requirements

| Method and route                                                    | Capability                           | Result                                               |
| ------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------- |
| `GET /api/admin-tenancy/v1/tenants/:tenant/entitlements`            | `admin-tenancy::entitlements::read`  | Full catalogue with effective booleans and revisions |
| `PUT /api/admin-tenancy/v1/tenants/:tenant/entitlements/:module`    | `admin-tenancy::entitlements::write` | Enabled state                                        |
| `DELETE /api/admin-tenancy/v1/tenants/:tenant/entitlements/:module` | `admin-tenancy::entitlements::write` | Disabled state                                       |

Unknown tenants or modules return `404`; unauthorized or Napsoft support targets
return `403`. Grant and withdrawal return `200`, including repeated requests.

## 11. Cross-Module Interactions

The projection workflow reads the complete source state and applies it in the
cell. Central success means only that the source changed. Projection status does
not change the entitlement row.

## 12. Security And Audit

Grant and withdrawal record actor, tenant, module, prior state, resulting state,
revision, and outcome. The source mutation and cache revision advance commit in
one transaction.

## 13. Acceptance Criteria

| Criterion | Required result                                                                        | Requirements                 |
| --------- | -------------------------------------------------------------------------------------- | ---------------------------- |
| AC01      | Reads return the effective state for every optional module and reject unknown tenants. | M0001-10-R001, M0001-10-R002 |
| AC02      | Grant, withdrawal, repeats, and competing updates follow the revision rules.           | M0001-10-R003, M0001-10-R005 |
| AC03      | Central changes work without a cell and do not claim projection success.               | M0001-10-R004                |
| AC04      | Entitlement changes grant no role or permission.                                       | M0001-10-R006                |
| AC05      | Support cannot read or change Napsoft entitlements.                                    | M0001-10-R002, M0001-10-R003 |

## 14. Outstanding Questions

None.
