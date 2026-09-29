# M0001-09: Tenant Selection

## 1. Document Control

| Field                | Value                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| Status               | Accepted                                                                                                       |
| Type                 | Module Work Unit                                                                                               |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)                                                              |
| Related architecture | [Admin and cells](../../../architecture/admin-cells.md), [BFF](../../../architecture/bff.md)                   |
| Related PRDs         | [M0001-04](M0001-04-session-management.md), [I0005](../../inter-module-workflows/I0005-rbac-decision-model.md) |
| Related decisions    | Napsoft staff reach other tenants through role capabilities, not a separate session mode                       |
| Last reviewed        | 2026-09-27                                                                                                     |

## 2. Purpose

Select a tenant for the session so later requests route to its cell.

## 3. Scope

### Included

- Listing and selecting eligible memberships.

### Excluded

- Session creation and base expiry.
- Opening the cell transaction.
- Capability evaluation, owned by [I0005](../../inter-module-workflows/I0005-rbac-decision-model.md).
- Impersonation and support tooling, left to a future support module
  ([support design guide](../../../design-guides/support.md), reference only).

## 4. Actors And Permissions

| Actor       | Target                       | Result        |
| ----------- | ---------------------------- | ------------- |
| Portal user | Own active, ready membership | Select tenant |

## 5. Concepts And Terminology

| Term            | Meaning                                                                             |
| --------------- | ----------------------------------------------------------------------------------- |
| Selected tenant | Tenant stored in the session for later routing; its code prefixes capability checks |

## 6. Functional Requirements

- M0001-09-R001: Normal selection must validate the current user's active, ready membership and the tenant's routing eligibility before changing the session.
- M0001-09-R002: Failed selection must leave the existing session unchanged.

## 7. Business Rules And Invariants

- M0001-09-R006: The API resolves the cell from the tenant record; callers never supply a database or connection.
- M0001-09-R007: Central selection does not claim that a cell transaction opened or that cell-side authorization passed.

Normal selection requires an active, ready membership; an active, provisioned,
RBAC-ready tenant; an assigned enabled cell; and runtime readiness. An unavailable
runtime cell returns `503 CELL_UNAVAILABLE` without changing the session.
Runtime readiness comes from the `runtime.readiness(cellId)` collaborator that
[I0003](../../inter-module-workflows/I0003-cell-provisioning.md) will supply; until then, every
selection returns `503 CELL_UNAVAILABLE`.

## 8. Lifecycle And State Transitions

| State               | Action                         | Result                               |
| ------------------- | ------------------------------ | ------------------------------------ |
| No tenant selected  | Select own tenant              | Tenant session and rotated token     |
| Tenant session      | Select another eligible tenant | New tenant session and rotated token |
| Eligibility removed | Resolve                        | Revoke the affected session          |

## 9. Data Requirements

This Work Unit reads tenants, memberships, and cells and updates
`admin.sessions`. M0001-00 defines all schema fields.

## 10. API Requirements

| Method and route                           | Request         | Result                                     |
| ------------------------------------------ | --------------- | ------------------------------------------ |
| `GET /api/admin-tenancy/v1/access/tenants` | Current session | Eligible tenant views                      |
| `POST /api/admin-tenancy/v1/access/select` | `{ tenant }`    | Selected tenant context and rotated cookie |

Invalid input returns `400`; missing records `404`; ineligible membership
`403`; unavailable cell `503`.

## 11. Cross-Module Interactions

M0001-04 owns token handling. Runtime routing uses the resolved cell UUID. The
receiving cell rechecks tenant availability and entitlements, and I0005 checks
capabilities from the user's role in their own tenant's cell.

## 12. Security And Audit

Selection success and failure record the actor, tenant, session, outcome, and
request ID without session credentials.

## 13. Acceptance Criteria

| Criterion | Required result                                                                       | Requirements                 |
| --------- | ------------------------------------------------------------------------------------- | ---------------------------- |
| AC01      | Only eligible memberships and tenants can be selected; failure preserves the session. | M0001-09-R001, M0001-09-R002 |
| AC02      | Browser-supplied database or cell values cannot influence routing.                    | M0001-09-R006                |
| AC05      | Central success never reports cell-side authorization success.                        | M0001-09-R007                |

### Verification Evidence

Re-verified on 2026-09-28 against the code after the RBAC rewrite ([silverstone-i/nap#42](https://github.com/silverstone-i/nap/pull/42), [#43](https://github.com/silverstone-i/nap/pull/43), [#44](https://github.com/silverstone-i/nap/pull/44), and the capability-scoping branch): `npm run lint`, `npm run format:check`, `npm test` (530 API, 148 web), `npm run build`, and `npm run test:db:local` (231 tests) passed. Covering tests: `tenant-access` (unit and integration), `access-context`, and `cell-provisioning` (selection with a ready cell).

The entries below predate the RBAC rewrite and are kept as history.

Tenant selection shipped in [#15](https://github.com/silverstone-i/nap/pull/15).
Local validation on 2026-09-21: `npm run lint`, `npm run format:check`,
`npm test`, `npm run build`, and `npm run licenses` passed, and `npm run test:db`
passed the [tenant-access integration tests](../../../../apps/api/tests/integration/tenant-access.test.js).

Integration tests cover: listing only the caller's own active, ready
memberships in eligible tenants; selecting an eligible tenant, rotating the
session token and setting the tenant (AC01); refusing an ineligible
membership, an ineligible tenant, and an unavailable cell, in each case
leaving the session unchanged (AC01); and reporting the cell unavailable purely
from the tenant record with no runtime collaborator wired up, even when the
cell is centrally enabled (AC02, AC05).

## 14. Outstanding Questions

None.
