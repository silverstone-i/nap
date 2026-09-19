# M0001-05: Authorization

## 1. Document Control

| Field                | Value                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| Status               | Draft                                                                                                       |
| Type                 | Module Work Unit                                                                                            |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)                                                           |
| Related architecture | [Module design](../../../architecture/module-design.md)                                                     |
| Related PRDs         | [M0001-02](M0001-02-root-user-provisioning.md), [M0001-09](M0001-09-tenant-selection-and-support-access.md) |
| Related decisions    | Support has full platform access except access to or action on Napsoft tenant data                          |
| Last reviewed        | 2026-09-18                                                                                                  |

## 2. Purpose

Seed immutable system roles into tenants and assign valid roles to portal users.

## 3. Scope

### Included

- The immutable `platform_admin`, `support`, and `tenant_admin` definitions.
- Two system-role seed scripts, run during tenant provisioning.
- Assignment and removal of system and tenant-defined roles in `admin.platform_roles`.
- Capability lookup for central authorization.

### Excluded

- Table definitions and migrations.
- Creation and editing of custom tenant-role definitions, owned by access-control.
- Physical cell provisioning and the tenant role-table migration.
- Route-specific business checks beyond the Napsoft support restriction.

## 4. Actors And Permissions

| Actor               | Target                                 | Result                                                |
| ------------------- | -------------------------------------- | ----------------------------------------------------- |
| `platform_admin`    | Any central record                     | Permit matching capability                            |
| `support`           | Record outside the Napsoft tenant      | Permit matching capability                            |
| `support`           | Napsoft tenant or data belonging to it | Deny before the operation reads or changes the record |
| `tenant_admin`      | Own tenant                             | Permit only the tenant-scoped capabilities below      |
| Tenant-defined role | Own tenant                             | Permit its assigned capabilities within that tenant   |
| Any actor           | Own role assignment                    | Cannot grant a role to itself                         |

## 5. Concepts And Terminology

| Term            | Meaning                                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| Capability      | Authorization identifier in `module::router::action` form                                                   |
| System role     | Immutable named capability set                                                                              |
| Role assignment | Portal user linked to a tenant-local role UUID in `admin.platform_roles`                                    |
| Napsoft data    | Tenant, membership, session, entitlement, event, or cell action whose target tenant has `is_napsoft = true` |

## 6. Functional Requirements

- M0001-05-R001: Tenant provisioning must run an all-tenant seed script that creates `tenant_admin` for every tenant, including the owning tenant. A separate owner-only script must create `platform_admin` and `support` only for the owning tenant. Both scripts use the capability sets below.
- M0001-05-R002: Runtime APIs must not edit or delete system-role definitions.
- M0001-05-R003: Assignments in `admin.platform_roles` must link portal users to any valid system or tenant-defined role using its tenant and role UUID, without capability overrides.
- M0001-05-R004: A portal user may hold multiple roles, including system and tenant-defined roles.
- M0001-05-R005: Authorization must resolve assigned roles in their owning tenant, combine capabilities applicable to the request, and apply target restrictions before calling the operation. Tenant-scoped assignments must not grant authority in another tenant; platform authority comes only from the owning tenant’s seeded `platform_admin` or `support` roles.

| Role             | Capabilities                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `platform_admin` | `admin-tenancy::control::read`, `admin-tenancy::control::write`, `admin-tenancy::accounts::read`, `admin-tenancy::accounts::write`, `admin-tenancy::roles::read`, `admin-tenancy::roles::write`, `admin-tenancy::sessions::revoke`, `admin-tenancy::entitlements::read`, `admin-tenancy::entitlements::write`, `admin-tenancy::events::read`, `admin-tenancy::access::support` |
| `support`        | Same capabilities as `platform_admin`, subject to the Napsoft-data denial                                                                                                                                                                                                                                                                                                      |
| `tenant_admin`   | `admin-tenancy::accounts::read`, `admin-tenancy::accounts::write`, `admin-tenancy::entitlements::read`, `admin-tenancy::events::read` within its tenant                                                                                                                                                                                                                        |

## 7. Business Rules And Invariants

- M0001-05-R006: Assignments must reference an active portal user, an active association with the role’s tenant, and an existing role in that tenant. Unavailable role validation must fail closed; a role name alone must not confer system-role authority.
- M0001-05-R007: A role-assignment change requires `admin-tenancy::roles::write`; tenant membership alone does not grant it.

Seeding is idempotent and fails if an existing role has a different
capability set or system-role identity. Seed files are the version-controlled
source; updates require a reviewed migration for existing tenants as well as
updated seeds for new tenants. Seeded system roles are immutable to runtime
APIs; tenant-defined role definitions remain editable under access-control rules.
Repeat grants return the active assignment. Repeat removals
return success. Removing the final active `platform_admin` is forbidden.

Support cannot read or change a Napsoft membership, selected-tenant session,
entitlement, event, or tenant-scoped record. A portal user and a platform
session are platform records, even when the user has a Napsoft membership.

## 8. Lifecycle And State Transitions

| State                         | Action       | Result                                                          |
| ----------------------------- | ------------ | --------------------------------------------------------------- |
| Role absent                   | Initialize   | Seed immutable definition into the tenant role table            |
| Definition matches            | Reinitialize | No change                                                       |
| Definition differs            | Reinitialize | Fail; use a reviewed migration for catalogue changes            |
| Assignment absent or archived | Grant        | Create or restore assignment                                    |
| Assignment active             | Grant        | Return existing assignment                                      |
| Assignment active             | Remove       | Archive assignment unless it is the last platform administrator |

## 9. Data Requirements

This Work Unit uses `admin.platform_roles`, defined by M0001-00, and the
role table in each tenant's cell, owned by access-control. There is no central
system-role catalogue. Seeded and tenant-defined roles use the same role UUID
reference.

The owning tenant's name is supplied through environment configuration.
Bootstrap marks that tenant with `is_napsoft = true`; seed eligibility and
support restrictions use that marker, never a hard-coded name. “Napsoft” in
this PRD family refers to that configured owning tenant.

## 10. API Requirements

| Method and route                                                       | Capability                    | Result                                 |
| ---------------------------------------------------------------------- | ----------------------------- | -------------------------------------- |
| `GET /api/admin-tenancy/v1/tenants/:tenant/roles`                      | `admin-tenancy::roles::read`  | Tenant roles and safe capability lists |
| `GET /api/admin-tenancy/v1/users/:id/roles`                            | `admin-tenancy::roles::read`  | Active role assignments                |
| `PUT /api/admin-tenancy/v1/tenants/:tenant/users/:id/roles/:roleId`    | `admin-tenancy::roles::write` | `200` active assignment                |
| `DELETE /api/admin-tenancy/v1/tenants/:tenant/users/:id/roles/:roleId` | `admin-tenancy::roles::write` | `204`                                  |

Unknown users, tenants, or roles return `404`; unavailable cell-role validation
returns `503`; self-grants, last-admin removal, and Napsoft support targets return `403`.

## 11. Cross-Module Interactions

Tenant provisioning runs the all-tenant seed after the tenant role table exists,
and also runs the owner-only seed for the configured owning tenant. WU 2
assigns the seeded `platform_admin` role to the root user after this step.
WU 9 evaluates support entry. Access-control owns role definitions and their
validation interface; Admin owns all portal-user role assignments.

Role deletion or capability changes in a cell must invalidate affected
authorization caches. A deleted or unresolvable role grants no authority.
End-to-end seeding and role resolution require the receiving cell modules;
central assignment storage alone does not complete this Work Unit.

## 12. Security And Audit

Every grant and removal records actor, target user, tenant, role UUID, outcome, and request
ID. Role changes advance authorization cache revisions in the same transaction.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                                                                    | Requirements                 |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| AC01      | Every tenant receives `tenant_admin`; only the configured owning tenant receives `platform_admin` and `support`. Repeat seeds preserve UUIDs and reject drift; runtime edits to system roles fail. | M0001-05-R001, M0001-05-R002 |
| AC02      | Users can hold system and tenant-defined roles; duplicate active user/tenant/role assignments are prevented and no capability overrides are stored.                                                | M0001-05-R003, M0001-05-R004 |
| AC03      | Authorization combines applicable assignments, prevents cross-tenant authority, rejects unresolved roles, and denies support access to the owning tenant’s data.                                   | M0001-05-R005                |
| AC04      | Unknown, inactive, wrong-tenant, self-granted, unauthorized, and last-admin changes fail; valid `tenant_admin` and custom-role assignments succeed.                                                | M0001-05-R006, M0001-05-R007 |

## 14. Outstanding Questions

None.
