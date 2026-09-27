# M0003: Access Control

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Draft                                                                                                                                                                                                                                                                                                       |
| Type                 | Module                                                                                                                                                                                                                                                                                                      |
| Related architecture | [Module map](../../architecture/module-map.md), [Migrations](../../architecture/migrations.md), [Admin and cells](../../architecture/admin-cells.md)                                                                                                                                                        |
| Related PRDs         | [I0005: RBAC Decision Model](../inter-module-workflows/I0005-rbac-decision-model.md), [M0001-02: Napsoft bootstrap](M0001-admin-tenancy/M0001-02-root-user-provisioning.md), [M0002: Cell Tenancy](M0002-cell-tenancy.md), [I0003: Cell Provisioning](../inter-module-workflows/I0003-cell-provisioning.md) |
| Related decisions    | Roles and role assignments live only in tenant cells; the admin database stores neither                                                                                                                                                                                                                     |
| Last reviewed        | 2026-09-27                                                                                                                                                                                                                                                                                                  |

## 2. Purpose

Each tenant needs roles: named sets of capability patterns that decide what a
user may do. `access-control` owns role definitions, their grants, and which
users hold which roles, all in the tenant's cell. It seeds the immutable roles
and lets a tenant manage custom roles and assignments. Deciding a request is
[I0005: RBAC Decision Model](../inter-module-workflows/I0005-rbac-decision-model.md).

## 3. Scope

### Included

- Roles, grants, and role assignments in the tenant's cell.
- The capability pattern grammar.
- The capability catalogue declared by module descriptors.
- Seeds for the immutable roles `platform_admin`, `support`, and `tenant_admin`.
- Custom role create, edit, archive, and restore, and a Roles screen.
- Assigning and removing roles, with the no-escalation and last-admin rules.

### Excluded

- Authentication, logins, sessions, and memberships: M0001.
- The customer-tenant seed run: tenant provisioning (roadmap 7). This module
  defines the seed; only the Napsoft seed runs in this version.
- Support impersonation, tickets, and support logging: the future support module.

## 4. Actors And Permissions

| Capability                                     | Allows                                          |
| ---------------------------------------------- | ----------------------------------------------- |
| `<TENANT>::access-control::roles::read`        | List roles, grants, assignments, and catalogue  |
| `<TENANT>::access-control::roles::write`       | Create, edit, archive, and restore custom roles |
| `<TENANT>::access-control::assignments::write` | Assign and remove roles                         |

`<TENANT>` is the target tenant's code, supplied by I0005. R011 and R013 limit
what these capabilities allow.

## 5. Concepts And Terminology

| Term               | Meaning                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| Capability         | Exact identifier `TENANT::module::router::action` that a route requires                                     |
| Capability pattern | Grant value in the same four-part form where any part may be `*`                                            |
| Role               | Named set of grants in one tenant                                                                           |
| Immutable role     | Seeded role (`platform_admin`, `support`, `tenant_admin`) whose grants and identity never change at runtime |
| Custom role        | Role created by a tenant                                                                                    |
| Grant              | One capability pattern on a role                                                                            |
| Assignment         | A portal user holding a role in the tenant                                                                  |
| Catalogue          | Every capability declared by registered module descriptors, without the tenant part                         |

## 6. Functional Requirements

- M0003-R001: The cell must store roles in `app.roles` with `id`, `code` unique per tenant, `name`, `description`, `is_immutable`, `revision`, soft delete, and audit fields.
- M0003-R002: The cell must store grants in `app.role_grants` with `role_id` and `pattern`, unique per role and pattern.
- M0003-R003: A pattern has exactly four parts separated by `::`. The tenant part is an uppercase tenant code or `*`. Each other part is a lowercase identifier (`[a-z0-9-]+`) or `*`. Any other value is rejected.
- M0003-R004: An exact module, router, or action in a pattern must exist in the catalogue.
- M0003-R005: Each module must declare its capabilities as `module::router::action` in its descriptor. Read-only capabilities use the action `read`, and no capability that changes data uses `read`. The catalogue is the union of registered descriptors.
- M0003-R006: The cell must store assignments in `app.role_assignments` with `portal_user_id` and `role_id`, unique per active pair, with soft delete and audit fields. A user may hold several roles.
- M0003-R007: The immutable roles and their grants are:

| Role             | Seeded into         | Grants                                                                              |
| ---------------- | ------------------- | ----------------------------------------------------------------------------------- |
| `platform_admin` | Napsoft tenant only | `*::*::*::*`, `NAP::*::*::*`                                                        |
| `support`        | Napsoft tenant only | `*::*::*::read`, `*::admin-tenancy::users::impersonate`, `NAP::support::tickets::*` |
| `tenant_admin`   | Every tenant        | `<CODE>::*::*::*`                                                                   |

`NAP` is the Napsoft tenant's code, from `ROOT_TENANT_CODE_<ENV>`. `<CODE>` is
the seeded tenant's own code.

- M0003-R008: The Napsoft seed must create all three immutable roles in the Napsoft cell and assign `platform_admin` to the login created by Napsoft bootstrap (M0001-02). It runs during bootstrap.
- M0003-R009: The customer-tenant seed must create `tenant_admin` for the tenant. Tenant provisioning runs it.
- M0003-R010: Seeds are idempotent by role `code`: a matching role is left unchanged and a role whose grants differ fails the seed. Changing an immutable role requires a reviewed migration.
- M0003-R011: A caller may assign, remove, create, or edit a role only if every pattern in the target role, including new grants, is covered by one of the caller's own patterns. Pattern A covers pattern B when each part of A equals B's or is `*`.
- M0003-R012: Removing the last active `tenant_admin` assignment in a tenant, or the last active `platform_admin` assignment in the Napsoft tenant, must be rejected with `LAST_ADMIN`.
- M0003-R013: Immutable roles must not be edited, archived, or deleted through the API. A custom role cannot use an immutable role's `code`.
- M0003-R014: Archiving a custom role keeps its grants and assignments; restoring returns them unchanged. An archived role grants nothing.
- M0003-R015: Every role, grant, or assignment change must write an administrative event with actor, tenant, role, and before and after values, and advance the cache revision I0005 uses for that tenant's roles.
- M0003-R016: The web app must provide a Roles screen: role list with immutable and custom badges, role detail with grants grouped by module, a create and edit form that picks capabilities from the catalogue, archive and restore, and a user's role assignments. Actions the session cannot perform are hidden (I0005).

## 7. Business Rules And Invariants

- A role, grant, or assignment belongs to exactly one tenant (database).
- `(tenant, code)` is unique, including archived roles (database).
- `is_immutable` never changes after insert (database).
- A stored pattern satisfies R003 (database check).
- A wildcard has no exclusion form; a role that needs all but one capability lists the allowed ones.

## 8. Lifecycle And State Transitions

| State      | Action          | Result                                      |
| ---------- | --------------- | ------------------------------------------- |
| —          | Seed            | Active immutable role                       |
| Immutable  | Reseed, same    | No change                                   |
| Immutable  | Reseed, differs | Seed fails                                  |
| —          | Create          | Active custom role                          |
| Active     | Edit            | Grants replaced; event written              |
| Active     | Archive         | Archived; grants nothing                    |
| Archived   | Restore         | Active                                      |
| Immutable  | Edit or archive | Reject `ROLE_IMMUTABLE`                     |
| Unassigned | Assign          | Active assignment; repeat assign returns it |
| Assigned   | Remove          | Archived; rejected when R012 applies        |

## 9. Data Requirements

| Table                  | Holds                                     |
| ---------------------- | ----------------------------------------- |
| `app.roles`            | Role definitions (R001)                   |
| `app.role_grants`      | Patterns per role (R002)                  |
| `app.role_assignments` | Which portal user holds which role (R006) |

- Tables live in each tenant's cell in the `app` schema and follow the cell rules for tenant business tables (M0002-01-R006).
- `role_grants.role_id` and `role_assignments.role_id` reference `app.roles.id`.
- `portal_user_id` holds the admin portal user ID; `cell.tenant_members` maps it to the person. There is no cross-database foreign key.
- Archived roles and assignments are kept so past events stay explainable.

## 10. API Requirements

Base: `/api/access-control/v1`. Capabilities below omit the tenant part, which I0005 adds.

| Method and route                      | Capability                           | Request                                      | Errors                                                    |
| ------------------------------------- | ------------------------------------ | -------------------------------------------- | --------------------------------------------------------- |
| `GET /capabilities`                   | `access-control::roles::read`        | —                                            | —                                                         |
| `GET /roles`                          | `access-control::roles::read`        | `?includeArchived`                           | —                                                         |
| `GET /roles/:id`                      | `access-control::roles::read`        | —                                            | `NOT_FOUND`                                               |
| `POST /roles`                         | `access-control::roles::write`       | `{ code, name, description?, grants[] }`     | `VALIDATION`, `CONFLICT`, `GRANT_EXCEEDS_ACTOR`           |
| `PATCH /roles/:id`                    | `access-control::roles::write`       | `{ name?, description?, grants?, revision }` | `ROLE_IMMUTABLE`, `STALE_REVISION`, `GRANT_EXCEEDS_ACTOR` |
| `POST /roles/:id/archive`             | `access-control::roles::write`       | `{ revision }`                               | `ROLE_IMMUTABLE`, `STALE_REVISION`                        |
| `POST /roles/:id/restore`             | `access-control::roles::write`       | `{ revision }`                               | `STALE_REVISION`                                          |
| `GET /users/:userId/roles`            | `access-control::roles::read`        | —                                            | `NOT_FOUND`                                               |
| `PUT /users/:userId/roles/:roleId`    | `access-control::assignments::write` | —                                            | `NOT_FOUND`, `NOT_MEMBER`, `GRANT_EXCEEDS_ACTOR`          |
| `DELETE /users/:userId/roles/:roleId` | `access-control::assignments::write` | —                                            | `NOT_FOUND`, `GRANT_EXCEEDS_ACTOR`, `LAST_ADMIN`          |

`grants` replaces the full set. The assigned user must be an active member of
the tenant (`cell.tenant_members`).

## 11. Cross-Module Interactions

- I0005 reads roles, grants, and assignments from the user's own tenant's cell.
- Napsoft bootstrap (M0001-02) runs the Napsoft seed (R008).
- Tenant provisioning runs the customer-tenant seed (R009).
- Module descriptors supply the catalogue (R005).
- Administrative events and cache revisions follow M0001-12 and M0001-11.

## 12. Security And Audit

- No escalation (R011), no lost last administrator (R012), and an event for
  every change (R015).

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                      | Requirements                       |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| AC01      | The cell migration creates the three tables; reruns are no-ops.                                                                      | M0003-R001, M0003-R002, M0003-R006 |
| AC02      | Invalid patterns and unknown catalogue names are rejected.                                                                           | M0003-R003, M0003-R004             |
| AC03      | The catalogue lists every declared capability; a data-changing capability named `read` fails registration.                           | M0003-R005                         |
| AC04      | Bootstrap seeds the three Napsoft roles and assigns `platform_admin` to the bootstrap login; reseeding changes nothing; drift fails. | M0003-R007, M0003-R008, M0003-R010 |
| AC05      | The customer-tenant seed creates only `tenant_admin`.                                                                                | M0003-R009                         |
| AC06      | Assigning, removing, creating, or editing a role beyond the caller's patterns fails; covered cases succeed.                          | M0003-R011                         |
| AC07      | Removing the last `tenant_admin`, or the last Napsoft `platform_admin`, fails.                                                       | M0003-R012                         |
| AC08      | Immutable roles cannot be edited or archived; archive and restore preserve grants and assignments.                                   | M0003-R013, M0003-R014             |
| AC09      | Each change writes an event and advances the role cache revision.                                                                    | M0003-R015                         |
| AC10      | The Roles screen supports list, detail, create, edit, archive, restore, and assignments, hiding disallowed actions.                  | M0003-R016                         |

## 14. Outstanding Questions

None.
