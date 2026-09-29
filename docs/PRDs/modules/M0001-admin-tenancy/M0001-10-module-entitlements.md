# M0001-10: Module Entitlements

## 1. Document Control

| Field                | Value                                                                            |
| -------------------- | -------------------------------------------------------------------------------- |
| Status               | Accepted                                                                         |
| Type                 | Module Work Unit                                                                 |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)                                |
| Related architecture | [Module map](../../../architecture/module-map.md)                                |
| Related PRDs         | [M0001-05](M0001-05-authorization.md), [M0001-11](M0001-11-cache-consistency.md) |
| Related decisions    | None                                                                             |
| Last reviewed        | 2026-09-21                                                                       |

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
- Roles and role assignments.

## 4. Actors And Permissions

| Actor                                               | Target         | Result                 |
| --------------------------------------------------- | -------------- | ---------------------- |
| Holder of `NAP::admin-tenancy::entitlements::write` | Any tenant     | Change entitlements    |
| Holder of `NAP::admin-tenancy::entitlements::read`  | Any tenant     | Read entitlements      |
| `tenant_admin`                                      | Own tenant     | Read entitlements only |
| Any actor                                           | Unknown module | Reject                 |

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

This Work Unit uses `admin.module_entitlements`. M0001-00 defines its schema and
tenant/module uniqueness.

## 10. API Requirements

| Method and route                                                    | Required capability                       | Result                                               |
| ------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------- |
| `GET /api/admin-tenancy/v1/tenants/:tenant/entitlements`            | `NAP::admin-tenancy::entitlements::read`  | Full catalogue with effective booleans and revisions |
| `PUT /api/admin-tenancy/v1/tenants/:tenant/entitlements/:module`    | `NAP::admin-tenancy::entitlements::write` | Enabled state                                        |
| `DELETE /api/admin-tenancy/v1/tenants/:tenant/entitlements/:module` | `NAP::admin-tenancy::entitlements::write` | Disabled state                                       |

Unknown tenants or modules return `404`; unauthorized callers receive `403`. Grant and withdrawal return `200`, including repeated requests.

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

### Verification Evidence

Re-verified on 2026-09-28 against the code after the RBAC rewrite ([silverstone-i/nap#42](https://github.com/silverstone-i/nap/pull/42), [#43](https://github.com/silverstone-i/nap/pull/43), [#44](https://github.com/silverstone-i/nap/pull/44), and the capability-scoping branch): `npm run lint`, `npm run format:check`, `npm test` (530 API, 148 web), `npm run build`, and `npm run test:db:local` (231 tests) passed. Covering tests: `entitlements` (unit and integration) and `authorize-tenant-param`, which checks that a `tenant_admin` reads its own tenant's entitlements and no other tenant's (§4).

The entries below predate the RBAC rewrite and are kept as history.

Local validation on 2026-09-21: `npm run lint`, `npm run format:check`,
`npm test` (382 unit tests across the workspace, including 17 new unit
tests), `npm run build`, and `npm run licenses` passed.

`npm run test:db` ran 158 tests against a disposable local PostgreSQL 18
server: 156 passed, including all 9
[entitlements integration tests](../../../../apps/api/tests/integration/entitlements.test.js),
and 2 failed. The two failures are in `admin-foundation.test.js` and predate
this Work Unit, as recorded in [M0001-07's verification evidence](M0001-07-tenant-creation.md#verification-evidence):
the local fixture server has no `postgres` superuser role and authenticates
with `trust`, so its wrong-password cases still connect. Neither touches
`admin.module_entitlements`.

Integration tests cover: reading the full 13-module catalogue as disabled
with revision `0` for a tenant with no rows (AC01); an unknown tenant
rejected on read (AC01); grant, no-op re-grant, withdrawal, and no-op
re-withdrawal following the stated revision rule, with a `succeeded` event
recorded for every call (AC02, §12); withdrawing an absent module creating
no row (§8); the entitlement cache revision — keyed by tenant UUID —
advancing only on a genuine `enabled` change, never on a no-op (§7, §11); an unknown tenant and an unknown module each
reporting `NOT_FOUND` (AC01); the real foreign key to `admin.tenants`; and
two concurrency cases under real advisory locks — two concurrent grants of
the same tenant and module resolving to exactly one row at revision 1, and a
concurrent grant and withdraw of the same pair resolving to exactly one
committed final state (AC02, §7's "last committed request determines
state"). Central changes never call a cell or claim a projection result
(AC03) — the domain layer has no cell dependency to begin with. Unit tests
cover session/capability/404/403 gating over an in-memory admin handle, the `entitlementView` mapping, the full-catalogue
overlay, and an unavailable cache-revision store surfacing `503`.

Entitlement changes touch only `admin.module_entitlements`,
`admin.managed_events`, and `admin.cache_revisions` — never
`admin.portal_user_tenants` or any role table — which is what AC04
demonstrates: nothing in this Work Unit's code path can grant a role or
permission, by construction rather than by a runtime check.

## 14. Outstanding Questions

None.
