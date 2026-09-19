# M0001: Admin Tenancy

## Scope

Build the admin-tenancy database setup, schemas, grants, migrations, models, and operations
listed below in the admin database's `admin` schema.

Cell infrastructure, cell-local roles and projections, business records, and
cross-module integration are delivered separately. Their dependencies are
recorded in the Work Unit PRDs.

## Admin Tenancy Work Units

The table gives the planned start order. WU 0 creates all admin tables and
models. WUs 1–12 implement record access, APIs, and business rules. Establish the cache and event contracts
early, then integrate them as each operation is built. WUs 11 and 12 are
complete only after their required integrations are verified.

Agree the account, credential, and initial-role requirements before root-user
provisioning. Tenant selection requires sessions, memberships, and platform-role
assignments. Role seeding requires the cell role table; initial root identity
creation precedes cell provisioning, and root-role assignment follows seeding.
PRD identifiers remain fixed when work is reordered.

“Napsoft” in this family means the owning tenant whose name is configured through
environment variables and whose record has `is_napsoft = true`; the name is not
hard-coded. Every tenant receives `tenant_admin`. Only the owning tenant receives
`platform_admin` and `support`.

| Start order | Work Unit / PRD                                                                                                                  | Required work                                                                                                     | Tables                                                         | Status      | Blocker / evidence                                                                                     |
| ----------: | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------ |
|           1 | [M0001-00: Admin database foundation](M0001-admin-tenancy/M0001-00-admin-database-foundation.md)                                 | Define all tables and schema objects; implement models, setup, migrations, grants, and database policies.         | All 12 admin tables                                            | Complete    | [Verified 2026-09-19](M0001-admin-tenancy/M0001-00-admin-database-foundation.md#verification-evidence) |
|           2 | [M0001-01: Tenant and portal-user access](M0001-admin-tenancy/M0001-01-tenant-and-portal-user-access.md)                         | Implement shared record lookups, membership lists, safe field selection, and consistent error handling.           | `tenants`, `portal_users`, `portal_user_tenants`               | Not started |                                                                                                        |
|           3 | [M0001-11: Cache consistency](M0001-admin-tenancy/M0001-11-cache-consistency.md)                                                 | Implement revision reads and invalidation for account, authorization, tenant, entitlement, and routing changes.   | `cache_revisions`                                              | Not started |                                                                                                        |
|           4 | [M0001-12: Administrative events](M0001-admin-tenancy/M0001-12-administrative-events.md)                                         | Define the event catalogue, append and read events, and record applicable admin actions.                          | `managed_events`                                               | Not started |                                                                                                        |
|           5 | [M0001-05: Authorization](M0001-admin-tenancy/M0001-05-authorization.md)                                                         | Define all-tenant and owner-only role seed scripts; assign any valid tenant-local role to portal users.           | `platform_roles`                                               | Not started |                                                                                                        |
|           6 | [M0001-03: Authentication](M0001-admin-tenancy/M0001-03-authentication.md)                                                       | Verify passwords, enforce required password changes, and throttle failed logins.                                  | `portal_users`, `login_throttles`                              | Not started |                                                                                                        |
|           7 | [M0001-02: Root-user provisioning](M0001-admin-tenancy/M0001-02-root-user-provisioning.md)                                       | Create the configured owning tenant and root identity; finalize the root role assignment after cell role seeding. | `tenants`, `portal_users`, `portal_user_tenants`               | Not started |                                                                                                        |
|           8 | [M0001-04: Session management](M0001-admin-tenancy/M0001-04-session-management.md)                                               | Create, resolve, rotate, expire, and revoke authenticated sessions.                                               | `sessions`                                                     | Not started |                                                                                                        |
|           9 | [M0001-06: Cell management](M0001-admin-tenancy/M0001-06-cell-management.md)                                                     | Register cells and track provisioning requests, progress, status, and failures.                                   | `cells`, `cell_provisioning`                                   | Not started |                                                                                                        |
|          10 | [M0001-07: Tenant creation](M0001-admin-tenancy/M0001-07-tenant-creation.md)                                                     | Create a central tenant record without requiring cell assignment or provisioning.                                 | `tenants`                                                      | Not started |                                                                                                        |
|          11 | [M0001-08: Portal-user and membership administration](M0001-admin-tenancy/M0001-08-portal-user-and-membership-administration.md) | Maintain ordinary users and central memberships; track requested membership provisioning and failures.            | `portal_users`, `portal_user_tenants`, `provisioning_jobs`     | Not started |                                                                                                        |
|          12 | [M0001-09: Tenant selection and support access](M0001-admin-tenancy/M0001-09-tenant-selection-and-support-access.md)             | Validate membership, select a tenant in the session, and control support access or impersonation.                 | `sessions`, `portal_user_tenants`, `tenants`, `platform_roles` | Not started |                                                                                                        |
|          13 | [M0001-10: Module entitlements](M0001-admin-tenancy/M0001-10-module-entitlements.md)                                             | Store and maintain which modules each tenant may use.                                                             | `module_entitlements`                                          | Not started |                                                                                                        |

## Status Tracking

- `Not started`: implementation has not begun.
- `In progress`: implementation or verification is underway.
- `Blocked`: record the decision or dependency preventing progress.
- `Complete`: the accepted PRD's requirements pass verification; record the evidence.

Update the relevant row when progress changes. PRD acceptance and implementation
status are separate; accept each PRD before implementation.
Admin Tenancy is complete when all 13 Work Units are complete, including their
required cache and event integration. Cell integration is verified separately.
