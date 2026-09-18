# M0001: Admin Tenancy

## Document Control

| Field                | Value                                                                                                                                                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Draft                                                                                                                                                                                                                                        |
| Type                 | Module family overview                                                                                                                                                                                                                       |
| Owner                | To be confirmed                                                                                                                                                                                                                              |
| Related architecture | [Module map](../../architecture/module-map.md), [Module design](../../architecture/module-design.md), [Admin and cells](../../architecture/admin-cells.md), [BFF](../../architecture/bff.md), [Migrations](../../architecture/migrations.md) |
| Roadmap              | [Admin work units and receiving dependencies](../../roadmap/ROADMAP.md#admin-tenancy-work-units)                                                                                                                                             |
| Last reviewed        | 2026-09-18                                                                                                                                                                                                                                   |

Each work-unit PRD owns its requirements and acceptance status. Accepting this
overview does not accept its work units. The roadmap tracks implementation
progress.

## Purpose

Admin Tenancy provides the central records NAP uses to manage tenants, portal
users, access, and cells, and to track administrative activity.

## Boundaries

All tables in this family belong to the `admin-tenancy` module in the admin
database's `admin` schema. Work-unit numbers identify documents, not modules or
implementation order.

- The module owns its migrations, models, repositories, and data invariants.
- Session resolution and authorization are application capabilities; cross-module workflows coordinate operations across modules.
- Cell infrastructure and cell-local records belong to the deliverables identified in the roadmap dependency map.
- Capability and workflow PRDs own broader application and UI behavior and reference this family's requirement IDs.

Central tenant creation does not require cell assignment or activation.
The architecture's tenant registration example includes a cell target;
[M0001-07: Tenant Creation](M0001-admin-tenancy/M0001-07-tenant-creation.md)
records the entry point for creation without assignment as an open decision.

[M0001-05: Authorization](M0001-admin-tenancy/M0001-05-authorization.md)
defines the distinction between system-role definitions and platform-role
assignments, including which roles can be assigned centrally.

## Table Ownership

Each table has one base-schema owner. Other work units reference that contract
and own only their specified behavior or field extensions.

| Admin table           | Base-schema work unit                  | Other work-unit use                                                             |
| --------------------- | -------------------------------------- | ------------------------------------------------------------------------------- |
| `tenants`             | 01: Foundation                         | 02 bootstrap; 07 creation fields; 08 memberships; 09 selection; 10 entitlements |
| `portal_users`        | 01: Foundation                         | 02 bootstrap; 03 credentials; 04 sessions; 05 grants; 08 administration         |
| `portal_user_tenants` | 01: Foundation                         | 02 bootstrap; 08 administration fields; 09 selection                            |
| `login_throttles`     | 03: Authentication                     | Login-attempt rules                                                             |
| `sessions`            | 04: Session Management                 | 09 tenant/support context fields                                                |
| `system_roles`        | 05: Authorization                      | 02 bootstrap command coordination; future cell-role seeds                       |
| `platform_roles`      | 05: Authorization                      | 09 support authorization                                                        |
| `cells`               | 06: Cell Management                    | Future tenant assignment and runtime routing                                    |
| `cell_provisioning`   | 06: Cell Management                    | Physical provisioning workflow results                                          |
| `provisioning_jobs`   | 08: User and Membership Administration | Membership provisioning workflow results                                        |
| `module_entitlements` | 10: Module Entitlements                | Future cell entitlement projections                                             |
| `cache_revisions`     | 11: Cache Consistency                  | Invalidation at the originating admin mutation                                  |
| `managed_events`      | 12: Administrative Events              | Applicable actions from units 01–11                                             |

## Work-Unit PRDs

| Identifier | PRD                                                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| M0001-01   | [Tenant and Portal-User Foundation](M0001-admin-tenancy/M0001-01-tenant-and-portal-user-foundation.md)                 |
| M0001-02   | [Root-User Provisioning](M0001-admin-tenancy/M0001-02-root-user-provisioning.md)                                       |
| M0001-03   | [Authentication](M0001-admin-tenancy/M0001-03-authentication.md)                                                       |
| M0001-04   | [Session Management](M0001-admin-tenancy/M0001-04-session-management.md)                                               |
| M0001-05   | [Authorization](M0001-admin-tenancy/M0001-05-authorization.md)                                                         |
| M0001-06   | [Cell Management](M0001-admin-tenancy/M0001-06-cell-management.md)                                                     |
| M0001-07   | [Tenant Creation](M0001-admin-tenancy/M0001-07-tenant-creation.md)                                                     |
| M0001-08   | [Portal-User and Membership Administration](M0001-admin-tenancy/M0001-08-portal-user-and-membership-administration.md) |
| M0001-09   | [Tenant Selection and Support Access](M0001-admin-tenancy/M0001-09-tenant-selection-and-support-access.md)             |
| M0001-10   | [Module Entitlements](M0001-admin-tenancy/M0001-10-module-entitlements.md)                                             |
| M0001-11   | [Cache Consistency](M0001-admin-tenancy/M0001-11-cache-consistency.md)                                                 |
| M0001-12   | [Administrative Events](M0001-admin-tenancy/M0001-12-administrative-events.md)                                         |

All work units are drafts. Each PRD records unresolved schema, permission,
business-rule, API, and lifecycle decisions in Open Questions. These decisions must be
resolved before that work unit is accepted. The acceptance authority remains
to be confirmed.

## Dependencies And Completion

Root-user provisioning requires agreement on the tenant, portal-user, and
membership records defined in unit 1, credential handling in unit 3, and the
root user's initial platform-role assignment in unit 5. Sessions use
authentication results. Tenant selection uses sessions, memberships, and
platform-role assignments.

Units 11 and 12 must define which changes invalidate cached data and which
actions create administrative-event records before the affected operations are
completed. Integration tests must verify that those operations create the
required `managed_events` records.

Admin operations can be verified before cell integrations exist. Admin
acceptance verifies the central operation and the requests and results it
exchanges with an integration. Cell-integration acceptance verifies actual cell
behavior and failure recovery. Tests using simulated cell or runner results do
not establish that the integration is complete. The
[roadmap dependency map](../../roadmap/ROADMAP.md#admin-to-cell-integration-dependencies)
assigns each integration to its owning deliverable.

C0001: Authentication, C0002: Session Management, C0003: RBAC, and the planned
workflow PRDs own the application behavior that uses these admin operations.
Required UI is delivered with the feature or workflow that exposes that
behavior, as specified in the roadmap.
