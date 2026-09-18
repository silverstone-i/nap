# M0001-01: Tenant and Portal-User Foundation

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Draft                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Type                 | Module work unit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Owner                | To be confirmed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Related architecture | [Module design](../../../architecture/module-design.md), [Migrations](../../../architecture/migrations.md)                                                                                                                                                                                                                                                                                                                                                                                                 |
| Related PRDs         | [M0001-02: Root-User Provisioning](M0001-02-root-user-provisioning.md), [M0001-03: Authentication](M0001-03-authentication.md), [M0001-04: Session Management](M0001-04-session-management.md), [M0001-07: Tenant Creation](M0001-07-tenant-creation.md), [M0001-08: Portal-User and Membership Administration](M0001-08-portal-user-and-membership-administration.md), [M0001-11: Cache Consistency](M0001-11-cache-consistency.md), [M0001-12: Administrative Events](M0001-12-administrative-events.md) |
| Related decisions    | None recorded separately; unresolved decisions are in section 14                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Last reviewed        | 2026-09-18                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## 2. Purpose

Provide the central tenant, portal-user, and membership records that NAP's
admin operations share, without requiring a cell database.

## 3. Scope

### Included

- Admin migrations, constraints, models, and repository access for the three foundation tables.
- Stable identities and relationships used by later admin work units.
- Central records that can exist before cell assignment or provisioning.

### Excluded

- Root-user bootstrap and ordinary user or tenant administration.
- Password verification, sessions, and authorization decisions.
- Cell assignment, projections, and business records.

## 4. Actors And Permissions

Foundation repositories are internal interfaces. Their callers establish the
actor's authority under the PRD for the requested operation.

| Context               | Actor                      | Required authority                 | Result                                      |
| --------------------- | -------------------------- | ---------------------------------- | ------------------------------------------- |
| Apply schema          | Migration command          | Admin database migration authority | Apply module migrations                     |
| Use a repository      | Authorized admin operation | Operation-specific authorization   | Access records within the operation's scope |
| Direct browser access | Browser caller             | None                               | No direct repository or database access     |

Runtime database grants and the migration/runtime role split remain open in Q03.

## 5. Concepts And Terminology

| Term        | Meaning                                                           |
| ----------- | ----------------------------------------------------------------- |
| Tenant      | Central identity for an organization using NAP                    |
| Portal user | A central person identity used for authentication                 |
| Membership  | A link between one portal user and one tenant                     |
| Repository  | Module-owned interface for reading and changing persisted records |

## 6. Functional Requirements

- M0001-01-R001: The module must provide migrations, models, and repository access for `admin.tenants`, `admin.portal_users`, and `admin.portal_user_tenants`.
- M0001-01-R002: Foundation operations must work with only the admin database; creating these records must not require a cell or a tenant business record.
- M0001-01-R003: Repositories must support lookup by record identity, a user's memberships, and a tenant's memberships.

Public creation and maintenance behavior is owned by [M0001-07: Tenant Creation](M0001-07-tenant-creation.md) and [M0001-08: Portal-User and Membership Administration](M0001-08-portal-user-and-membership-administration.md).

## 7. Business Rules And Invariants

- M0001-01-R004: Each foundation record must have a stable identity, and each membership must reference an existing central portal user and tenant.
- M0001-01-R005: Shared foundation constraints must apply to every writer, including bootstrap and administration.

Database migrations own keys and relationship constraints. Business validation
belongs to module operations. Key types, duplicate-membership rules, identity
normalization, and deletion effects require Q01–Q02 before schema acceptance.

## 8. Lifecycle And State Transitions

This unit establishes record existence and valid relationships. It does not
assign lifecycle values on behalf of later units.

Tenant creation state is defined by [M0001-07: Tenant Creation](M0001-07-tenant-creation.md), ordinary identity and membership
lifecycle by [M0001-08: Portal-User and Membership Administration](M0001-08-portal-user-and-membership-administration.md), and initial root records by [M0001-02: Root-User Provisioning](M0001-02-root-user-provisioning.md). Their agreed fields
extend this foundation through module-owned migrations. Later operational tenant
states belong to the tenant-provisioning integration contract.

## 9. Data Requirements

| Table                       | Required meaning                                                             | Relationships and access                                   | Sensitivity                   |
| --------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------- |
| `admin.tenants`             | Stable central tenant identity; registration metadata belongs to unit 7      | Referenced by memberships; lookup by identity              | Central organization metadata |
| `admin.portal_users`        | Stable central person identity; login identifier contract shared with unit 3 | Referenced by memberships and sessions                     | Personal identity data        |
| `admin.portal_user_tenants` | Central user-to-tenant relationship                                          | References portal user and tenant; lookup from either side | Tenant access relationship    |

A portal user is central; a membership provides tenant context. No cross-database
foreign key is needed. Exact columns, key types, required identity fields,
uniqueness, audit fields, and retention are decisions in Q01–Q03.

## 10. API Requirements

No public HTTP route is introduced by this unit.

| Internal operation         | Input                                   | Result                                 | Failure contract                                       |
| -------------------------- | --------------------------------------- | -------------------------------------- | ------------------------------------------------------ |
| Find tenant or portal user | Stable identity                         | Record or absence                      | Persistence errors remain distinguishable from absence |
| Read memberships           | Portal-user or tenant identity          | Matching central relationships         | No unrelated memberships                               |
| Persist foundation records | Fields accepted by the owning operation | Persisted identities and relationships | Enforce M0001-01-R004 and M0001-01-R005                |

Exact repository signatures, transaction participation, and lookup shapes remain
open in Q04. Idempotency of business commands belongs to their owning PRDs.

## 11. Cross-Module Interactions

- [M0001-02: Root-User Provisioning](M0001-02-root-user-provisioning.md) creates the initial Napsoft tenant and root membership.
- [M0001-03: Authentication](M0001-03-authentication.md) defines authentication fields added to portal users.
- [M0001-04: Session Management](M0001-04-session-management.md) references portal users from persisted sessions.
- [M0001-07: Tenant Creation](M0001-07-tenant-creation.md) and [M0001-08: Portal-User and Membership Administration](M0001-08-portal-user-and-membership-administration.md) define ordinary creation and administration.

There is no cell dependency. Later cell projections consume these central
identities without changing their ownership.

## 12. Security And Audit

- M0001-01-R006: Repository reads must preserve the caller's authorized scope and must not expose authentication secrets through ordinary identity queries.

[M0001-11: Cache Consistency](M0001-11-cache-consistency.md) owns invalidation rules for cached identity and membership data.
[M0001-12: Administrative Events](M0001-12-administrative-events.md) owns event storage; events describe the originating operation rather
than treating every low-level database read or write as an event.
Retention and deletion rules remain open in Q02.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                        | Requirements                                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC01      | Migrations and repositories operate against an admin-only database with no configured cells.                                                           | M0001-01-R001, M0001-01-R002                                                                                                                           |
| AC02      | Records can be found by identity and memberships queried from either side.                                                                             | M0001-01-R003                                                                                                                                          |
| AC03      | Missing user or tenant references are rejected, including through bootstrap and administration callers.                                                | M0001-01-R004, M0001-01-R005                                                                                                                           |
| AC04      | Identity reads respect scope and omit authentication secrets.                                                                                          | M0001-01-R006                                                                                                                                          |
| AC05      | Applicable source mutations invalidate their cached decisions and record the required catalogue events; failures follow the accepted shared contracts. | [M0001-11-R002](M0001-11-cache-consistency.md#6-functional-requirements), [M0001-12-R001](M0001-12-administrative-events.md#6-functional-requirements) |

Schema tests require the decisions below; passing a provisional schema does not
make this PRD accepted.

## 14. Open Questions

| ID  | Decision required before acceptance                                                                                                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q01 | Which identity fields, key types, normalization rules, and uniqueness constraints apply to each table, including repeated user/tenant memberships? |
| Q02 | What are the deletion, retention, and relationship-preservation rules?                                                                             |
| Q03 | Which database grants and audit metadata apply to foundation records?                                                                              |
| Q04 | What repository signatures, transaction boundaries, and absence/error results do the consuming units require?                                      |
