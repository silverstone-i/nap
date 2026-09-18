# M0001-05: Authorization

## 1. Document Control

| Field                | Value                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| Status               | Draft                                                                                                       |
| Type                 | Module work unit                                                                                            |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)                                                           |
| Related architecture | [Module design](../../../architecture/module-design.md)                                                     |
| Related PRDs         | [M0001-02](M0001-02-root-user-provisioning.md), [M0001-09](M0001-09-tenant-selection-and-support-access.md) |
| Related decisions    | Support has full platform access except access to or action on Napsoft tenant data                          |
| Last reviewed        | 2026-09-18                                                                                                  |

## 2. Purpose

Define system roles and assign platform roles to portal users.

## 3. Scope

### Included

- The immutable `platform_admin`, `support`, and `tenant_admin` definitions.
- Platform-role assignment and removal.
- Capability lookup for central authorization.

### Excluded

- Table definitions and migrations.
- Custom tenant roles and cell-side assignments.
- Route-specific business checks beyond the Napsoft support restriction.

## 4. Actors And Permissions

| Actor            | Target                                 | Result                                                |
| ---------------- | -------------------------------------- | ----------------------------------------------------- |
| `platform_admin` | Any central record                     | Permit matching capability                            |
| `support`        | Record outside the Napsoft tenant      | Permit matching capability                            |
| `support`        | Napsoft tenant or data belonging to it | Deny before the operation reads or changes the record |
| `tenant_admin`   | Own tenant                             | Permit only the tenant-scoped capabilities below      |
| Any actor        | Own role assignment                    | Cannot grant a role to itself                         |

## 5. Concepts And Terminology

| Term          | Meaning                                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| Capability    | Authorization identifier in `module::router::action` form                                                   |
| System role   | Immutable named capability set                                                                              |
| Platform role | `platform_admin` or `support` assignment stored centrally                                                   |
| Napsoft data  | Tenant, membership, session, entitlement, event, or cell action whose target tenant has `is_napsoft = true` |

## 6. Functional Requirements

- M0001-05-R001: Initialization must create exactly `platform_admin`, `support`, and `tenant_admin` with the capability sets below.
- M0001-05-R002: Runtime APIs must not edit or delete system-role definitions.
- M0001-05-R003: Platform assignments must link portal users only to `platform_admin` or `support` and must not contain capability overrides.
- M0001-05-R004: A portal user may hold both platform roles.
- M0001-05-R005: Authorization must combine all assigned role capabilities and apply target restrictions before calling the operation.

| Role             | Capabilities                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `platform_admin` | `admin-tenancy::control::read`, `admin-tenancy::control::write`, `admin-tenancy::accounts::read`, `admin-tenancy::accounts::write`, `admin-tenancy::roles::read`, `admin-tenancy::roles::write`, `admin-tenancy::sessions::revoke`, `admin-tenancy::entitlements::read`, `admin-tenancy::entitlements::write`, `admin-tenancy::events::read`, `admin-tenancy::access::support` |
| `support`        | Same capabilities as `platform_admin`, subject to the Napsoft-data denial                                                                                                                                                                                                                                                                                                      |
| `tenant_admin`   | `admin-tenancy::accounts::read`, `admin-tenancy::accounts::write`, `admin-tenancy::entitlements::read` within its tenant                                                                                                                                                                                                                                                       |

## 7. Business Rules And Invariants

- M0001-05-R006: Platform assignments must reference an existing active portal user and an initialized platform role.
- M0001-05-R007: A platform-role change requires `admin-tenancy::roles::write`; tenant membership alone does not grant it.

Initialization is idempotent and fails if an existing role has a different
capability set. Repeat grants return the active assignment. Repeat removals
return success. Removing the final active `platform_admin` is forbidden.

Support cannot read or change a Napsoft membership, selected-tenant session,
entitlement, event, or tenant-scoped record. A portal user and a platform
session are platform records, even when the user has a Napsoft membership.

## 8. Lifecycle And State Transitions

| State                         | Action       | Result                                                          |
| ----------------------------- | ------------ | --------------------------------------------------------------- |
| Role absent                   | Initialize   | Insert immutable definition                                     |
| Definition matches            | Reinitialize | No change                                                       |
| Definition differs            | Reinitialize | Fail; use a reviewed migration for catalogue changes            |
| Assignment absent or archived | Grant        | Create or restore assignment                                    |
| Assignment active             | Grant        | Return existing assignment                                      |
| Assignment active             | Remove       | Archive assignment unless it is the last platform administrator |

## 9. Data Requirements

This work unit uses `admin.system_roles` and `admin.platform_roles`. M0001-00
defines their schema and constraints.

## 10. API Requirements

| Method and route                                     | Capability                    | Result                                 |
| ---------------------------------------------------- | ----------------------------- | -------------------------------------- |
| `GET /api/admin-tenancy/v1/roles`                    | `admin-tenancy::roles::read`  | System roles and safe capability lists |
| `GET /api/admin-tenancy/v1/users/:id/roles`          | `admin-tenancy::roles::read`  | Active platform assignments            |
| `PUT /api/admin-tenancy/v1/users/:id/roles/:role`    | `admin-tenancy::roles::write` | `200` active assignment                |
| `DELETE /api/admin-tenancy/v1/users/:id/roles/:role` | `admin-tenancy::roles::write` | `204`                                  |

Unknown users or roles return `404`; disallowed `tenant_admin` assignments,
self-grants, last-admin removal, and Napsoft support targets return `403`.

## 11. Cross-Module Interactions

Unit 2 assigns the root user `platform_admin`. Unit 9 evaluates support entry.
Cell access-control initialization copies the `tenant_admin` definition but owns
its cell-side assignment.

## 12. Security And Audit

Every grant and removal records actor, target user, role, outcome, and request
ID. Role changes advance authorization cache revisions in the same transaction.

## 13. Acceptance Criteria

| Criterion | Required result                                                                           | Requirements                 |
| --------- | ----------------------------------------------------------------------------------------- | ---------------------------- |
| AC01      | Initialization creates the three exact definitions and rejects drift.                     | M0001-05-R001, M0001-05-R002 |
| AC02      | Users can hold both platform roles without capability overrides.                          | M0001-05-R003, M0001-05-R004 |
| AC03      | Authorization combines assignments and denies support access to Napsoft data.             | M0001-05-R005                |
| AC04      | Unknown, inactive, self-granted, tenant-admin, unauthorized, and last-admin changes fail. | M0001-05-R006, M0001-05-R007 |

## 14. Outstanding Questions

None.
