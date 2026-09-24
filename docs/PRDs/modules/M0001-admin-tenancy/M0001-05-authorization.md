# M0001-05: Authorization

## 1. Document Control

| Field                | Value                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Status               | Implemented                                                                                                        |
| Type                 | Module Work Unit                                                                                                   |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)                                                                  |
| Related architecture | [Module design](../../../architecture/module-design.md)                                                            |
| Related PRDs         | [M0001-02](M0001-02-root-user-provisioning.md), [M0001-09](M0001-09-tenant-selection-and-support-access.md), M0569 |
| Last reviewed        | 2026-09-23                                                                                                         |

## 2. Purpose

Grant root authority from the portal user’s `is_root` flag. Role seeds,
assignments, and non-root authority moved to M0569.

## 3. Scope

### Included

- Root authority derived from the portal user’s `is_root` flag.
- The `platform_admin` capability set that root authority grants.
- Exact capability lookup for central authorization.

### Excluded

- Table definitions and migrations.
- System-role seeds, role assignments, non-root resolution, wildcard
  capability matching, and the Napsoft support restriction, owned by M0569.

## 4. Actors And Permissions

| Actor     | Target             | Result                                        |
| --------- | ------------------ | --------------------------------------------- |
| Root user | Any central record | Permit the `platform_admin` capability set    |
| Non-root  | Any central record | Deny every capability until M0569 is complete |

## 5. Concepts And Terminology

| Term           | Meaning                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Capability     | Explicit authorization identifier in `module::router::action` form                                                             |
| Root authority | `platform_admin` capabilities granted by software to an active root user in an unrestricted session, without a role assignment |

## 6. Functional Requirements

- M0001-05-R001: Authorization must grant an active root user in an unrestricted session the complete `platform_admin` capability set from `is_root = true`, without resolving or requiring a role assignment. Every other user resolves no capabilities.

| Role             | Capabilities                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `platform_admin` | `admin-tenancy::control::read`, `admin-tenancy::control::write`, `admin-tenancy::accounts::read`, `admin-tenancy::accounts::write`, `admin-tenancy::roles::read`, `admin-tenancy::roles::write`, `admin-tenancy::sessions::revoke`, `admin-tenancy::entitlements::read`, `admin-tenancy::entitlements::write`, `admin-tenancy::events::read`, `admin-tenancy::access::support` |

## 7. Business Rules And Invariants

`is_root` is the only non-role source of application capabilities. Root
authority does not depend on cell provisioning or role seeding.

## 8. Lifecycle And State Transitions

| State            | Action    | Result                                                          |
| ---------------- | --------- | --------------------------------------------------------------- |
| Active root user | Authorize | Grant the `platform_admin` capability set without an assignment |
| Any other user   | Authorize | Grant no capabilities                                           |

## 9. Data Requirements

This Work Unit reads `admin.portal_users.is_root`, defined by M0001-00.

## 10. Cross-Module Interactions

WU 2 creates the root identity; its `is_root` flag grants the `platform_admin`
capability set without an assignment or role seed dependency.

## 11. Acceptance Criteria

| Criterion | Required result                                                                                                                                | Requirements  |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| AC01      | Authorization grants the root user `platform_admin` capabilities from `is_root` without an assignment; non-root users resolve no capabilities. | M0001-05-R001 |

### Verification Evidence

Implemented in PR #11. `resolveAuthorization`
([authorization.js](../../../../apps/api/src/modules/admin-tenancy/domain/authorization.js))
returns `PLATFORM_ADMIN_CAPABILITIES` only for an active `is_root` user whose
session is unrestricted and in `normal` access mode, an empty set for any
other active user, and throws `FORBIDDEN` for an inactive or missing user. [authorization.test.js](../../../../apps/api/tests/unit/authorization.test.js)
covers the root grant, restricted and support-mode root sessions, non-root
users, and inactive users; 5 tests passed on 2026-09-23.

## 12. Outstanding Questions

None.
