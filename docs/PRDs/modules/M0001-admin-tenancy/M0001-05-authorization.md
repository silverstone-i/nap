# M0001-05: Authorization

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Draft                                                                                                                                                                                                                                                                                                                                                                                                      |
| Type                 | Module work unit                                                                                                                                                                                                                                                                                                                                                                                           |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)                                                                                                                                                                                                                                                                                                                                                          |
| Owner                | To be confirmed                                                                                                                                                                                                                                                                                                                                                                                            |
| Related architecture | [Module map](../../../architecture/module-map.md), [Module design](../../../architecture/module-design.md)                                                                                                                                                                                                                                                                                                 |
| Related PRDs         | [M0001-01: Tenant and Portal-User Foundation](M0001-01-tenant-and-portal-user-foundation.md), [M0001-02: Root-User Provisioning](M0001-02-root-user-provisioning.md), [M0001-09: Tenant Selection and Support Access](M0001-09-tenant-selection-and-support-access.md), [M0001-11: Cache Consistency](M0001-11-cache-consistency.md), [M0001-12: Administrative Events](M0001-12-administrative-events.md) |
| Related decisions    | None recorded separately; unresolved decisions are in section 14                                                                                                                                                                                                                                                                                                                                           |
| Last reviewed        | 2026-09-18                                                                                                                                                                                                                                                                                                                                                                                                 |

## 2. Purpose

Store NAP's immutable system-role definitions and assign platform roles to
portal users so admin authorization can use explicit central grants.

## 3. Scope

### Included

- `platform_admin`, `support`, and `tenant_admin` system-role definitions.
- Their `module::router::action` capabilities.
- Multiple platform-role assignments per portal user.
- Central lookup and maintenance contracts for those definitions and assignments.

### Excluded

- Seeding applicable system roles into `cell.roles`.
- Assigning `tenant_admin` or custom roles inside cells.
- Tenant scope evaluation and broader RBAC behavior owned by C0003: RBAC.

## 4. Actors And Permissions

| Context                                                 | Actor                 | Required authority or condition                            | Result                            |
| ------------------------------------------------------- | --------------------- | ---------------------------------------------------------- | --------------------------------- |
| Read definitions for authorization                      | Authorization service | Internal access to central capability definitions          | Read system roles and assignments |
| Assign or remove a platform role                        | Operator              | Explicit grant-management capability; catalogue unresolved | Apply a valid assignment change   |
| Assign `platform_admin` or `support`                    | Authorized operator   | Existing portal user and valid system role                 | Eligible central assignment       |
| Assign `tenant_admin` or a custom role centrally        | Any operator          | Role is not a platform role                                | Reject                            |
| Edit or delete a system definition through runtime APIs | Any portal user       | Definition is immutable                                    | Reject                            |

A role's name does not supply unspecified capabilities. The exact catalogue
and grant-management capabilities remain open in Q01.

## 5. Concepts And Terminology

| Term                     | Meaning                                                         |
| ------------------------ | --------------------------------------------------------------- |
| System role              | One of the three fixed role definitions                         |
| Capability               | An authorization name in `module::router::action` form          |
| Platform role assignment | A link from a portal user to `platform_admin` or `support`      |
| Immutable definition     | A definition that ordinary runtime administration cannot change |

## 6. Functional Requirements

- M0001-05-R001: `admin.system_roles` must define exactly `platform_admin`, `support`, and `tenant_admin`, with their agreed capabilities in `module::router::action` form.
- M0001-05-R002: System-role definitions must be immutable through ordinary runtime operations.
- M0001-05-R003: `admin.platform_roles` must map portal users only to assigned platform roles; it must not contain independent role definitions or capability overrides.
- M0001-05-R004: A portal user must be able to hold multiple platform assignments, including both `platform_admin` and `support`.
- M0001-05-R005: Central authorization consumers must be able to retrieve a user's platform assignments and their associated capability definitions.

## 7. Business Rules And Invariants

- M0001-05-R006: Platform assignments must reference an existing portal user and a defined `platform_admin` or `support` role; `tenant_admin` and custom roles must not be assigned through `admin.platform_roles`.
- M0001-05-R007: Platform-role changes must require explicit authorization and must not derive their authority solely from tenant membership.

Unit 1 owns portal-user identity. Whether identical duplicate assignments are
rejected or treated as an existing assignment remains open in Q03. Controlled
release changes to immutable definitions require the rules in Q02.

## 8. Lifecycle And State Transitions

| Record              | Operation               | Outcome                                            |
| ------------------- | ----------------------- | -------------------------------------------------- |
| System roles        | Initial seed            | Three named definitions and agreed capability sets |
| System roles        | Runtime edit or delete  | Rejected                                           |
| Platform assignment | Authorized grant        | User receives the named platform assignment        |
| Platform assignment | Authorized removal      | Assignment ceases to grant authority               |
| Existing assignment | Repeat grant or removal | Follow Q03                                         |

Role removal effects on active support sessions and cached decisions are shared
with units 9 and 11. No last-administrator rule is assumed; Q04 resolves it.

## 9. Data Requirements

| Table                  | Required contents                                          | Constraints and access                                                |
| ---------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------- |
| `admin.system_roles`   | Stable role identity/name and its capability definitions   | Three agreed names; lookup by role; immutable runtime definitions     |
| `admin.platform_roles` | Portal-user reference and assigned platform-role reference | Multiple assignments per user; references restricted by M0001-05-R006 |

Physical capability representation, assignment keys, grant metadata, uniqueness,
and retention are open in Q02–Q03. Platform access is central and separate from
cell-local tenant role assignments.

## 10. API Requirements

| Operation                 | Input                                       | Result                                 |
| ------------------------- | ------------------------------------------- | -------------------------------------- |
| Read system roles         | Role identity or catalogue request          | Immutable definitions and capabilities |
| Read platform assignments | Portal-user identity                        | Assigned platform roles                |
| Grant platform role       | Authorized actor, target user, allowed role | Assignment result                      |
| Remove platform role      | Authorized actor and target assignment      | Removal result                         |

Methods, routes, exact capability checks, response schemas, and idempotency are
open in Q01 and Q03. There is no runtime API to author system roles.

## 11. Cross-Module Interactions

- [M0001-02: Root-User Provisioning](M0001-02-root-user-provisioning.md) coordinates initial installation; initial root authority is decided in Q04.
- [M0001-09: Tenant Selection and Support Access](M0001-09-tenant-selection-and-support-access.md) consumes platform authority for controlled support access.
- [M0001-11: Cache Consistency](M0001-11-cache-consistency.md) and [M0001-12: Administrative Events](M0001-12-administrative-events.md) define invalidation and event contracts for assignment changes.

Cell-role seeding and tenant/custom-role assignments are separate roadmap
integration deliverables. C0003: RBAC owns the broader decision model, including
how multiple applicable capabilities combine; it references these central
records instead of defining another platform-role catalogue.

## 12. Security And Audit

Grant-management capabilities, self-grants, last-administrator protection, and
support restrictions require explicit decisions. Multiple assignments do not
implicitly establish precedence or an unrestricted support bypass.

Administrative events cover agreed grant/removal outcomes under [M0001-12: Administrative Events](M0001-12-administrative-events.md).
Capability definitions and assignment history need the disclosure and retention
rules in Q03.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                        | Requirements                                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC01      | Seeding establishes the three named roles with approved capability syntax and contents.                                                                | M0001-05-R001                                                                                                                                          |
| AC02      | Runtime edits and deletion of system definitions are rejected.                                                                                         | M0001-05-R002                                                                                                                                          |
| AC03      | A user can hold both allowed platform roles; assignment rows contain no independent capability overrides.                                              | M0001-05-R003, M0001-05-R004                                                                                                                           |
| AC04      | Authorization lookup returns the user's assignments and referenced definitions.                                                                        | M0001-05-R005                                                                                                                                          |
| AC05      | Unknown users, unknown roles, `tenant_admin`, and custom-role assignments are rejected centrally.                                                      | M0001-05-R006                                                                                                                                          |
| AC06      | Unauthorized grants/removals fail, including callers relying only on tenant membership.                                                                | M0001-05-R007                                                                                                                                          |
| AC07      | Applicable source mutations invalidate their cached decisions and record the required catalogue events; failures follow the accepted shared contracts. | [M0001-11-R002](M0001-11-cache-consistency.md#6-functional-requirements), [M0001-12-R001](M0001-12-administrative-events.md#6-functional-requirements) |

## 14. Open Questions

| ID  | Decision required before acceptance                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------- |
| Q01 | What exact capabilities belong to each role, and which authorize reads, grants, and removals?                     |
| Q02 | How are capabilities stored, and how are deliberate release changes to immutable definitions approved and seeded? |
| Q03 | What are the API, assignment uniqueness, retry, attribution, deletion, and retention contracts?                   |
| Q04 | What initial role does the root user receive, and what self-grant or last-administrator protections apply?        |
| Q05 | What is the central consumer contract for capability combination and role-removal effects on active sessions?     |
