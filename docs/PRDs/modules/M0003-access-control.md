# M0003: Access Control

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Draft                                                                                                                                                                                                                                                                                                                                                                                                            |
| Type                 | Module                                                                                                                                                                                                                                                                                                                                                                                                           |
| Related architecture | [Module map](../../architecture/module-map.md), [Migrations](../../architecture/migrations.md), [Admin and cells](../../architecture/admin-cells.md)                                                                                                                                                                                                                                                             |
| Related PRDs         | [I0005: RBAC Decision Model](../inter-module-workflows/I0005-rbac-decision-model.md), [M0001-05: Authorization](M0001-admin-tenancy/M0001-05-authorization.md), [M0001-09: Tenant Selection and Support Access](M0001-admin-tenancy/M0001-09-tenant-selection-and-support-access.md), [M0002: Cell Tenancy](M0002-cell-tenancy.md), [I0004: Admin-Cell Sync](../inter-module-workflows/I0004-admin-cell-sync.md) |
| Related decisions    | System roles live in the same role table as tenant-defined roles; role assignments live in `admin.platform_roles`                                                                                                                                                                                                                                                                                                |
| Last reviewed        | 2026-09-26                                                                                                                                                                                                                                                                                                                                                                                                       |

## 2. Purpose

Each tenant needs its own roles: named sets of capabilities that decide what a
member may do. `access-control` owns those role definitions, their capability
grants, and their access scopes in the tenant's cell (`cell/app` schema). It
seeds the system roles every tenant starts with and lets a tenant
administrator manage the rest.

This module owns data only. How a request turns roles into a permit or deny
is defined by [I0005: RBAC Decision Model](../inter-module-workflows/I0005-rbac-decision-model.md).

## 3. Scope

### Included

- Role definitions, both system and tenant-defined, in one table.
- Capability grants on a role, in exact or wildcard form.
- Access scopes on a role grant.
- System-role seeds run by tenant provisioning.
- The capability catalogue: every capability a registered module declares.
- API and UI to list, create, edit, archive, and restore tenant-defined roles
  and to view system roles.

### Excluded

- Role assignments to portal users: stored in `admin.platform_roles`
  (M0001-00-01); assignment rules and validation are in I0005.
- Resolving a session's capabilities and deciding a request: I0005.
- Root authority from `is_root`: M0001-05.
- Support-context entry and expiry: M0001-09.

## 4. Actors And Permissions

| Context        | Actor                                  | Required capability            | Required state         | Result                                      |
| -------------- | -------------------------------------- | ------------------------------ | ---------------------- | ------------------------------------------- |
| Tenant session | Member                                 | `access-control::roles::read`  | Tenant active          | List roles, grants, and the catalogue       |
| Tenant session | Member                                 | `access-control::roles::write` | Tenant active          | Create, edit, archive, restore custom roles |
| Tenant session | Member with `roles::write`             | `access-control::roles::write` | Target is system role  | Deny edit and archive; read allowed         |
| Tenant session | Member with `roles::write`             | `access-control::roles::write` | Grant exceeds own set  | Deny (I0005-R009)                           |
| Support (read) | `support`, root, or `platform_admin`   | `access-control::roles::read`  | Support session active | Read only                                   |
| Any            | Member without the required capability | —                              | —                      | Deny                                        |

## 5. Concepts And Terminology

| Term               | Meaning                                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Role               | Named, tenant-local set of capability grants                                                                                       |
| System role        | Role seeded by software, identified by a fixed `code`; its grants change only through a migration                                  |
| Custom role        | Role created by a tenant administrator                                                                                             |
| Grant              | One capability pattern on a role, with an optional access scope                                                                    |
| Capability pattern | An exact capability `module::router::action`, or a wildcard in the router or action position (`module::*::*`, `module::router::*`) |
| Access scope       | Restriction on which records a grant applies to; `tenant` (all records) is the only scope in this version                          |
| Owning tenant      | The configured Napsoft tenant that holds the `platform_admin` and `support` roles                                                  |

## 6. Functional Requirements

- M0003-R001: The module must store roles in one table per cell, with `id`, `tenant_id`, unique `code` per tenant, `name`, `description`, `is_system`, and soft-delete and audit fields.
- M0003-R002: The module must store grants with `role_id`, a capability pattern, and an access scope, unique per role and pattern.
- M0003-R003: A capability pattern must match `^[a-z0-9-]+::([a-z0-9-]+|\*)::([a-z0-9-]+|\*)$`, and a wildcard router must be followed by a wildcard action. The module must reject any other pattern.
- M0003-R004: An exact pattern must name a capability in the catalogue; a wildcard pattern must name a module in the catalogue.
- M0003-R005: Each module must declare its capabilities in its module descriptor; the catalogue is the union of registered descriptors, served read-only.
- M0003-R006: Tenant provisioning must seed `tenant_admin` for every tenant, and `platform_admin` and `support` only for the owning tenant. Seeds must be idempotent and keyed by `code`.
- M0003-R007: System-role grants must be:

| Role             | Grants                                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `tenant_admin`   | Every module the tenant uses, as `module::*::*`, excluding `admin-tenancy`                                                          |
| `platform_admin` | The M0001-05 `platform_admin` capability set, as exact patterns                                                                     |
| `support`        | The `platform_admin` set minus `admin-tenancy::roles::write`, `admin-tenancy::accounts::write`, and `admin-tenancy::control::write` |

- M0003-R008: System roles must not be edited, archived, or deleted through the API.
- M0003-R009: A custom role must be archived, not hard-deleted; archiving must not delete its grants, and restoring must return them unchanged.
- M0003-R010: `GET` routes must return roles with their grants, and the catalogue grouped by module.
- M0003-R011: Every role or grant change must write an administrative event (M0001-12 shape) with actor, tenant, role, and before and after grant sets, and must invalidate cached decisions for that role (I0005-R011).
- M0003-R012: The UI must provide a Roles screen: a list with system and custom badges, a role detail view with grants grouped by module, a create and edit form that picks capabilities from the catalogue, and archive and restore actions. Actions the caller cannot perform must be hidden or disabled per I0005-R013.

## 7. Business Rules And Invariants

- A role belongs to exactly one tenant; RLS on `nap.tenant_id` enforces it (database).
- `(tenant_id, code)` is unique, including archived rows (database).
- `is_system` is immutable (database).
- A grant's pattern satisfies R003 (domain; also a database check constraint).
- No custom role may be named with a system `code` (domain).

## 8. Lifecycle And State Transitions

| State    | Action        | Actor                          | Result                                           |
| -------- | ------------- | ------------------------------ | ------------------------------------------------ |
| —        | Seed          | Tenant provisioning            | Active system role                               |
| —        | Create        | `access-control::roles::write` | Active custom role                               |
| Active   | Edit          | `access-control::roles::write` | Active; grants replaced; event written           |
| Active   | Archive       | `access-control::roles::write` | Archived; assignments stop granting (I0005-R004) |
| Archived | Restore       | `access-control::roles::write` | Active                                           |
| System   | Edit, archive | Any                            | Reject `ROLE_IMMUTABLE`                          |

## 9. Data Requirements

| Table             | Holds                                        | Tenant boundary |
| ----------------- | -------------------------------------------- | --------------- |
| `app.roles`       | Role definitions (R001)                      | RLS on tenant   |
| `app.role_grants` | Capability pattern and scope per role (R002) | RLS on tenant   |

- Audit fields hold the portal user ID (M0002 rule).
- `app.role_grants.role_id` references `app.roles.id` with cascade on hard delete only.
- Retention: archived roles are kept indefinitely so past assignments remain explainable.
- `access-control` is registered in the cell module registry (M0002-01); its migration runs in the `app` schema step.

## 10. API Requirements

Base: `/api/access-control/v1`. All routes run in `withTenantTransaction`.

| Method and route          | Capability                     | Request                                      | Response            | Errors                                                    |
| ------------------------- | ------------------------------ | -------------------------------------------- | ------------------- | --------------------------------------------------------- |
| `GET /capabilities`       | `access-control::roles::read`  | —                                            | Catalogue by module | —                                                         |
| `GET /roles`              | `access-control::roles::read`  | `?includeArchived`                           | Roles with grants   | —                                                         |
| `GET /roles/:id`          | `access-control::roles::read`  | —                                            | Role with grants    | `NOT_FOUND`                                               |
| `POST /roles`             | `access-control::roles::write` | `{ code, name, description?, grants[] }`     | Created role        | `VALIDATION`, `CONFLICT`, `GRANT_EXCEEDS_ACTOR`           |
| `PATCH /roles/:id`        | `access-control::roles::write` | `{ name?, description?, grants?, revision }` | Updated role        | `ROLE_IMMUTABLE`, `STALE_REVISION`, `GRANT_EXCEEDS_ACTOR` |
| `POST /roles/:id/archive` | `access-control::roles::write` | `{ revision }`                               | Archived role       | `ROLE_IMMUTABLE`, `STALE_REVISION`                        |
| `POST /roles/:id/restore` | `access-control::roles::write` | `{ revision }`                               | Active role         | `STALE_REVISION`                                          |

Writes use optimistic concurrency on `revision`. `grants` replaces the full set.

## 11. Cross-Module Interactions

- Tenant provisioning (roadmap item 7) calls the R006 seed.
- `admin-tenancy` validates an assignment's `role_id` against this table via I0005.
- I0005 reads roles and grants to resolve capabilities.
- Module descriptors of every module supply the catalogue (R005).

## 12. Security And Audit

- RLS isolates roles per tenant; `nap-app` cannot bypass it.
- Support sessions are read-only (M0002 tenant context).
- A member cannot grant capabilities they do not hold (I0005-R009), preventing self-escalation.
- Every change writes an administrative event (R011).

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                       | Requirements           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| AC01      | Migration creates both tables with RLS; the cell catalog check passes; reruns are no-ops.                                             | M0003-R001, M0003-R002 |
| AC02      | Invalid patterns and unknown capabilities or modules are rejected.                                                                    | M0003-R003, M0003-R004 |
| AC03      | The catalogue lists every declared capability of registered modules.                                                                  | M0003-R005, M0003-R010 |
| AC04      | Provisioning seeds the correct roles and grants; rerunning changes nothing; non-owning tenants have no `platform_admin` or `support`. | M0003-R006, M0003-R007 |
| AC05      | System roles cannot be edited or archived through the API.                                                                            | M0003-R008             |
| AC06      | Archive and restore preserve grants; stale revisions are rejected.                                                                    | M0003-R009             |
| AC07      | Each change writes an event and invalidates cached decisions.                                                                         | M0003-R011             |
| AC08      | The Roles screen supports list, detail, create, edit, archive, and restore, with permission-aware actions.                            | M0003-R012             |

## 14. Outstanding Questions

- Access-scope dimensions beyond `tenant` (company, project) depend on the `companies` and `projects` PRDs. Confirm `tenant` is the only scope for this version.
- Confirm custom roles ship in this version, or only system roles first.
- Confirm the wildcard grammar in R003 (no partial-name wildcards).
- Confirm the `support` grant list in R007.
