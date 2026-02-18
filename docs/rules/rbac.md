# Business Rules — RBAC (Role-Based Access Control)

**Domain:** Authentication & Authorization
**Last Updated:** 2026-02-20
**Status:** Active — four-layer scoped model implemented
**ADR Reference:** ADR-0013 (Four-layer scoped RBAC) — supersedes ADR-0004

---

## Rule Index

| ID | Rule Summary |
|---|---|
| [BR-RBAC-001](#br-rbac-001) | Permission levels are strictly ordered: none < view < full |
| [BR-RBAC-002](#br-rbac-002) | Policy resolution follows specificity hierarchy (most specific wins) |
| [BR-RBAC-003](#br-rbac-003) | Default permission is none when no matching policy exists |
| [BR-RBAC-004](#br-rbac-004) | super_user bypasses all permission checks globally |
| [BR-RBAC-005](#br-rbac-005) | super_user role can only be assigned to NapSoft tenant users |
| [BR-RBAC-006](#br-rbac-006) | admin role has full control within tenant, blocked from tenants module |
| [BR-RBAC-007](#br-rbac-007) | GET/HEAD requests require view level minimum |
| [BR-RBAC-008](#br-rbac-008) | Mutation requests (POST/PUT/PATCH/DELETE) require full level |
| [BR-RBAC-009](#br-rbac-009) | Permissions are cached in Redis per user per tenant |
| [BR-RBAC-010](#br-rbac-010) | JWT ph claim is used to detect stale cached permissions |
| [BR-RBAC-011](#br-rbac-011) | Tenant context is resolved at request time, not embedded in JWT |
| [BR-RBAC-012](#br-rbac-012) | Each tenant schema contains its own isolated copy of RBAC tables |
| [BR-RBAC-013](#br-rbac-013) | super_user cannot be archived |
| [BR-RBAC-014](#br-rbac-014) | Users cannot archive themselves |
| [BR-RBAC-015](#br-rbac-015) | Restoring a user requires the parent tenant to be active |
| [BR-RBAC-016](#br-rbac-016) | Root tenant (NAP) cannot be archived |
| [BR-RBAC-017](#br-rbac-017) | At most one admin and one billing user per tenant |
| [BR-RBAC-018](#br-rbac-018) | Email must be globally unique across all active users |
| [BR-RBAC-019](#br-rbac-019) | User registration must use /register endpoint — standard POST is disabled |
| [BR-RBAC-020](#br-rbac-020) | Passwords are always bcrypt-hashed — never stored in plaintext |
| [BR-RBAC-021](#br-rbac-021) | Admin users can only access users belonging to their own tenant |
| [BR-RBAC-022](#br-rbac-022) | RBAC uses four layers: policies, scope, state filters, field groups |
| [BR-RBAC-023](#br-rbac-023) | Layers 2-4 only narrow access — they never expand beyond Layer 1 |
| [BR-RBAC-024](#br-rbac-024) | Data scope is a property of the role: all_projects, assigned_companies, or assigned_projects |
| [BR-RBAC-025](#br-rbac-025) | assigned_projects scope restricts data to the user's project_members entries |
| [BR-RBAC-026](#br-rbac-026) | State filters restrict visible record statuses per role per resource |
| [BR-RBAC-027](#br-rbac-027) | Field groups restrict visible columns per role per resource |
| [BR-RBAC-028](#br-rbac-028) | Default field group definitions (is_default = true) are granted to all roles |
| [BR-RBAC-029](#br-rbac-029) | Multi-role scope merge: most permissive scope wins (three-tier hierarchy) |
| [BR-RBAC-030](#br-rbac-030) | Multi-role state filter merge: union of visible statuses |
| [BR-RBAC-031](#br-rbac-031) | Multi-role field group merge: union of granted columns |
| [BR-RBAC-032](#br-rbac-032) | super_user and admin bypass all four RBAC layers |
| [BR-RBAC-033](#br-rbac-033) | Layers 2-4 are opt-in per controller via rbacConfig |
| [BR-RBAC-034](#br-rbac-034) | Empty state filters or field groups mean no restriction (permissive default) |
| [BR-RBAC-035](#br-rbac-035) | Cache invalidation on scope/filter/grant changes invalidates affected users |
| [BR-RBAC-036](#br-rbac-036) | All roles except super_user and admin are tenant-configurable |
| [BR-RBAC-037](#br-rbac-037) | Data scope has three tiers: all_projects > assigned_companies > assigned_projects |
| [BR-RBAC-038](#br-rbac-038) | assigned_companies scope restricts data to projects belonging to the user's assigned inter-companies |
| [BR-RBAC-039](#br-rbac-039) | Multi-role scope hierarchy: all_projects beats assigned_companies beats assigned_projects |
| [BR-RBAC-040](#br-rbac-040) | The policy_catalog table provides a discoverable registry of valid module/router/action combinations |
| [BR-RBAC-041](#br-rbac-041) | Router names in policies use URL path segments as the canonical convention |
| [BR-RBAC-042](#br-rbac-042) | Changes to company_members must invalidate affected users' Redis permission cache |
| [BR-RBAC-043](#br-rbac-043) | Cross-tenant access is restricted to NapSoft users via x-tenant-code header |
| [BR-RBAC-044](#br-rbac-044) | User impersonation requires NapSoft tenant membership and is audit-logged |
| [BR-RBAC-045](#br-rbac-045) | Tenants module routes require both NapSoft membership AND RBAC capability |
| [BR-RBAC-046](#br-rbac-046) | Employee-driven user lifecycle: is_app_user toggle on employees controls nap_users creation |
| [BR-RBAC-047](#br-rbac-047) | RBAC admin role is auto-assigned to tenant creator on tenant provisioning |
| [BR-RBAC-048](#br-rbac-048) | Impersonation sessions are tracked via Redis and bounded to one active session per user |

---

## Rules

### BR-RBAC-001
**Rule:** Permission levels are strictly ordered: `none` (0) < `view` (1) < `full` (2).
**Enforcement:** RBAC middleware — `rbac(requiredLevel)` compares numeric level values.

---

### BR-RBAC-002
**Rule:** Policy resolution follows a specificity hierarchy. The most specific matching policy wins.
Resolution order:
1. `module::router::action` (e.g., `ar::ar-invoices::approve`)
2. `module::router::` (e.g., `ar::ar-invoices::`)
3. `module::::` (e.g., `ar::::`)
4. Default: `none`

**Enforcement:** Permission resolver in `authRedis` middleware.

---

### BR-RBAC-003
**Rule:** If no policy matches the requested `module::router::action`, the effective permission defaults to `none`. Access is denied.
**Enforcement:** Policy resolution fallback in permission loader.

---

### BR-RBAC-004
**Rule:** Users with the `super_user` role bypass all permission checks on all routes globally.
**Enforcement:** RBAC middleware — short-circuits permission check when `role === 'super_user'`.

---

### BR-RBAC-005
**Rule:** The `super_user` role can only be assigned to users belonging to the NapSoft tenant (`tenant_code = 'NAP'`).
**Enforcement:** Server-side validation in user registration and role assignment endpoints.

---

### BR-RBAC-006
**Rule:** The `admin` role grants full access within a tenant. For the `tenants` module, access requires both NapSoft membership AND an RBAC capability (`tenants::tenants::full`). The `admin` role is seeded with this capability, so NapSoft admins can manage tenants while non-NapSoft admins are blocked by `requireNapsoftTenant`.
**Enforcement:** Dual gate on `/api/tenants/v1/tenants/` routes: `requireNapsoftTenant` middleware + `withMeta({ module: 'tenants', router: 'tenants' })` + `rbac()`. See also [BR-RBAC-045](#br-rbac-045).
**UI Behavior:** The "Settings" sidebar navigation item (formerly "Manage Tenants") is not rendered for any user who is not a NapSoft employee. Visibility is determined by the `isNapSoftUser` flag in `AuthContext` (compares `tenant_code` against `VITE_NAPSOFT_TENANT`) — not by permission level. See [UI-VIS-001](./ui-visibility.md#ui-vis-001).

---

### BR-RBAC-007
**Rule:** GET and HEAD requests require a minimum permission level of `view`.
**Enforcement:** RBAC middleware default — `requiredLevel` defaults to `view` for read operations.

---

### BR-RBAC-008
**Rule:** Mutation requests (POST, PUT, PATCH, DELETE) require a minimum permission level of `full`.
**Enforcement:** RBAC middleware default — `requiredLevel` defaults to `full` for write operations.

---

### BR-RBAC-009
**Rule:** Resolved permission sets are cached in Redis keyed by `perm:{userId}:{tenantCode}`. Cache is invalidated when roles or policies change.
**Enforcement:** `authRedis` middleware reads from cache; cache is invalidated on role/policy mutation.

---

### BR-RBAC-010
**Rule:** The JWT contains a `ph` (permissions hash) claim — a SHA-256 hash of the user's current policy set. If the cached permissions hash diverges from the JWT `ph` claim, the server responds with `X-Token-Stale: 1` to signal the client to refresh.
**Enforcement:** `authRedis` middleware — ETag comparison on each request.

---

### BR-RBAC-011
**Rule:** Tenant context (`tenant_code`, `schema_name`) is NOT embedded in the JWT. It is resolved at request time via the `x-tenant-code` header, Redis cache, and database lookup.
**Enforcement:** `authRedis` middleware — see ADR-0003.

---

### BR-RBAC-012
**Rule:** Each tenant's RBAC tables (`roles`, `role_members`, `policies`) live within that tenant's own PostgreSQL schema. There is no shared RBAC table across tenants.
**Enforcement:** pg-schemata schema isolation — see ADR-0001.

---

### BR-RBAC-013
**Rule:** A user with the `super_user` role cannot be archived.
**Enforcement:** Server-side guard in the archive user endpoint.

---

### BR-RBAC-014
**Rule:** A user cannot archive their own account.
**Enforcement:** Server-side guard in the archive user endpoint — compares `req.user.id` against target user ID.

---

### BR-RBAC-015
**Rule:** Restoring an archived user requires the user's parent tenant to be in `active` status.
**Enforcement:** Server-side check in the restore user endpoint.

---

### BR-RBAC-016
**Rule:** The root NapSoft tenant (`tenant_code = 'NAP'`) cannot be archived or deleted under any circumstances.
**Enforcement:** Server-side guard in the archive tenant endpoint — returns 403.

---

### BR-RBAC-017
**Rule:** At most one user per tenant may hold `tenant_role = 'admin'` and at most one may hold `tenant_role = 'billing'` at any time.
**Enforcement:** Unique partial index on `(tenant_id, tenant_role) WHERE tenant_role IS NOT NULL` in `admin.nap_users`.

---

### BR-RBAC-018
**Rule:** Email addresses must be globally unique across all active users. The same email cannot be registered to two active accounts, even across different tenants.
**Enforcement:** Partial unique index on `email WHERE deactivated_at IS NULL` in `admin.nap_users`.

---

### BR-RBAC-019
**Rule:** Users must be created via the `/register` endpoint. The standard POST endpoint for `nap_users` is disabled. Registration collects: email, user_name, full_name, password, phones (optional array), addresses (optional array), tenant_role (optional), tax_id (optional), notes (optional).
**Enforcement:** Standard POST route not implemented for `nap_users`.

---

### BR-RBAC-020
**Rule:** Passwords are never stored in plaintext. All passwords are hashed with bcrypt before storage, both on registration and on XLS import.
**Enforcement:** Registration service and import handler — bcrypt hash applied before any `INSERT`.

---

### BR-RBAC-021
**Rule:** An admin user can only read, create, modify, or archive users belonging to their own tenant. Cross-tenant user access is not permitted regardless of role.
**Enforcement:** Structurally enforced by schema-per-tenant isolation (ADR-0001) — queries run within the tenant's own schema. Additionally enforced at the service layer by tenant context resolved from the request via `authRedis` middleware.

> **Note:** This rule is implied by the architecture but stated explicitly here because it is non-obvious to developers unfamiliar with the schema isolation model. A developer working on user queries should not need to add a `WHERE tenant_id = ?` clause — but they should understand *why* it isn't needed.

---

### BR-RBAC-022
**Rule:** RBAC enforcement uses four layers: (1) Role Policies — what a role can do, (2) Data Scope — how much data the role sees, (3) Record State Filters — which record statuses are visible, (4) Field Groups — which columns are visible.
**Enforcement:** Layer 1 via RBAC middleware; Layers 2-4 via `ViewController._applyRbacFilters()`.
**ADR:** ADR-0013

---

### BR-RBAC-023
**Rule:** Layers 2-4 only narrow the data set. They can never grant access to data, records, or columns that Layer 1 does not already permit. If Layer 1 denies access (`none`), Layers 2-4 are not evaluated.
**Enforcement:** Middleware gate (Layer 1) runs before service-layer filters (Layers 2-4).

---

### BR-RBAC-024
**Rule:** Each role has a `scope` property: `all_projects` (default), `assigned_companies`, or `assigned_projects`. This determines the breadth of data the role can see.
**Enforcement:** `roles.scope` column with CHECK constraint. Stored in the permission canon and enforced at query time.

---

### BR-RBAC-025
**Rule:** When `scope = 'assigned_projects'`, the user only sees data from projects they are explicitly assigned to via the `project_members` table. The `project_members` table maps `(project_id, user_id)` with a unique constraint on the pair.
**Enforcement:** `ViewController._applyRbacFilters()` adds a `WHERE scopeColumn IN (projectIds)` condition when scope is `assigned_projects`.

---

### BR-RBAC-026
**Rule:** State filters restrict which record statuses are visible to a role for a given resource. A `state_filters` row specifies `(role_id, module, router, visible_statuses[])`. Records with a status not in the visible list are excluded from query results.
**Enforcement:** `ViewController._applyRbacFilters()` adds a `WHERE status IN (visibleStatuses)` condition.

---

### BR-RBAC-027
**Rule:** Field groups restrict which columns are returned for a given resource. A field group definition lists a set of column names. A field group grant assigns a definition to a role. Only columns from granted field groups are included in query results.
**Enforcement:** `ViewController._applyRbacFilters()` restricts `columnWhitelist`; `_filterRecordFields()` strips disallowed fields from single-record reads.

---

### BR-RBAC-028
**Rule:** Field group definitions marked `is_default = true` are automatically granted to all roles, regardless of explicit `field_group_grants` rows. This ensures baseline column visibility without requiring a grant for every role.
**Enforcement:** Permission loader (`RbacPolicies.js`) includes `is_default = true` definitions in the column set for every role.

---

### BR-RBAC-029
**Rule:** When a user holds multiple roles, the effective scope is the **most permissive** across all roles. The hierarchy is: `all_projects` (broadest) > `assigned_companies` > `assigned_projects` (narrowest). If any role grants `all_projects`, the user sees all data regardless of other roles' scopes.
**Enforcement:** Permission loader merges scopes using `SCOPE_ORDER` — highest value wins (`all_projects: 2`, `assigned_companies: 1`, `assigned_projects: 0`).

---

### BR-RBAC-030
**Rule:** When a user holds multiple roles with state filters on the same resource, the effective visible statuses are the **union** of all roles' `visible_statuses` arrays for that resource.
**Enforcement:** Permission loader merges state filters with `Set` union per `module::router` key.

---

### BR-RBAC-031
**Rule:** When a user holds multiple roles with field group grants on the same resource, the effective visible columns are the **union** of all granted field groups' column lists for that resource.
**Enforcement:** Permission loader merges field group columns with `Set` union per `module::router` key.

---

### BR-RBAC-032
**Rule:** `super_user` and `admin` bypass all four RBAC layers entirely. They see all data, all statuses, and all columns with no scope restrictions. *(Supersedes the scope of BR-RBAC-004 and BR-RBAC-006 for Layers 2-4.)*
**Enforcement:** `ViewController._applyRbacFilters()` checks `BYPASS_ROLES` set and returns early.

---

### BR-RBAC-033
**Rule:** Layers 2-4 enforcement is opt-in per controller. A controller must declare `this.rbacConfig = { module, router, scopeColumn }` for scope, state, and field filtering to be applied. Controllers without `rbacConfig` are unaffected — only Layer 1 middleware applies.
**Enforcement:** `ViewController._applyRbacFilters()` returns early if `this.rbacConfig` is null.

---

### BR-RBAC-034
**Rule:** When no `state_filters` rows exist for a role on a given resource, all record statuses are visible. When no `field_group_grants` (and no `is_default` definitions) exist for a role on a given resource, all columns are visible. The system defaults to permissive when Layers 3-4 are unconfigured.
**Enforcement:** Permission loader returns empty objects (`{}`) for stateFilters and fieldGroups when no data exists. `ViewController` skips filtering when the corresponding value is `null` or absent.

---

### BR-RBAC-035
**Rule:** Changes to `project_members`, `company_members`, `state_filters`, `field_group_grants`, `field_group_definitions`, or `roles.scope` must invalidate the affected users' Redis permission cache so that the updated canon is rebuilt on the next request.
**Enforcement:** `rbacCacheInvalidation.js` — `invalidateUserPermissions()` clears a single user's cache; `invalidateRolePermissions()` finds all users with a given role and invalidates each.

---

### BR-RBAC-036
**Rule:** All tenant roles except `super_user` and `admin` are fully tenant-configurable. Tenants may create, modify, and delete roles, assign scopes, define state filters, and build field groups. `super_user` and `admin` are system roles with `is_system = true` and `is_immutable = true`.
**Enforcement:** Seed logic marks `super_user` and `admin` as system/immutable. Role management endpoints should reject modifications to immutable roles.

### BR-RBAC-037
**Rule:** Data scope has three tiers ordered by breadth: `all_projects` (broadest) > `assigned_companies` > `assigned_projects` (narrowest). This hierarchy determines the data visibility for each role.
**Enforcement:** `SCOPE_ORDER` constant in `RbacPolicies.js` — `{ assigned_projects: 0, assigned_companies: 1, all_projects: 2 }`.

---

### BR-RBAC-038
**Rule:** When `scope = 'assigned_companies'`, the user only sees data from projects belonging to inter-companies they are explicitly assigned to via the `company_members` table. The permission loader eagerly resolves both `companyIds` (from `company_members`) and `projectIds` (projects belonging to those companies) so downstream resources with either `company_id` or `project_id` scope columns can be filtered.
**Enforcement:** `RbacPolicies.js` queries `company_members` for the user's companies, then resolves `projectIds` from the `projects` table where `company_id IN (companyIds)`. `ViewController._applyRbacFilters()` uses the appropriate ID list based on `rbacConfig.scopeColumn`.

---

### BR-RBAC-039
**Rule:** Multi-role scope hierarchy: `all_projects` beats `assigned_companies` beats `assigned_projects`. When a user holds multiple roles, the broadest scope wins. If any role grants `all_projects`, the user sees all data. If the broadest scope is `assigned_companies`, the user sees data from their assigned companies' projects.
**Enforcement:** Permission loader uses `SCOPE_ORDER` to select the winning scope across all roles.

---

### BR-RBAC-040
**Rule:** The `policy_catalog` table provides a discoverable registry of all valid `module/router/action` combinations. This is seed-only reference data used by the role configuration UI to present valid options when building policies. It has no runtime enforcement role — it is purely for discovery.
**Enforcement:** Seeded via `seed_policy_catalog.js`. No audit fields, no tenant_code — static reference data shared across all tenants.

---

### BR-RBAC-041
**Rule:** Router names in policies use URL path segments as the canonical convention (e.g., `ar-invoices`, not `invoices`). This ensures consistency between the `withMeta()` annotation on routes and the policy keys stored in the database.
**Enforcement:** Convention enforced by `seed_policy_catalog.js` entries, `withMeta()` annotations on routers, and policy seed data.

---

### BR-RBAC-042
**Rule:** Changes to `company_members` must invalidate the affected users' Redis permission cache so that the updated `companyIds` and `projectIds` are rebuilt on the next request.
**Enforcement:** Same mechanism as BR-RBAC-035 — `invalidateUserPermissions()` called when `company_members` rows are added, removed, or modified.

---

### BR-RBAC-043
**Rule:** Cross-tenant access is restricted to NapSoft users. When a request includes an `x-tenant-code` header that differs from the user's home tenant (from JWT or DB), only users whose home tenant matches the `NAPSOFT_TENANT` env var (default `'NAP'`) are permitted to assume the requested tenant context. Non-NapSoft users silently fall back to their home tenant.
**Enforcement:** `authRedis` middleware — `resolveTenantContext()` validates cross-tenant requests and sets `is_cross_tenant` flag on `req.user`.

---

### BR-RBAC-044
**Rule:** NapSoft users can impersonate any user in any tenant. Impersonation swaps `req.user` and `req.ctx` to the target user's identity and permissions for the duration of the session. Every impersonation session is recorded in `admin.impersonation_logs` with `impersonator_id`, `target_user_id`, `target_tenant_code`, `reason`, `started_at`, and `ended_at`. The impersonator's real identity is preserved on the impersonated request as `req.user.impersonated_by`.
**Enforcement:** `authRedis` middleware reads `imp:{userId}` Redis key. Impersonation endpoints require `requireNapsoftTenant` middleware. Audit log insertion occurs in `adminController.startImpersonation()`.

---

### BR-RBAC-045
**Rule:** Tenants module routes (`/api/tenants/v1/tenants/*`) require both NapSoft membership (via `requireNapsoftTenant` middleware) AND an RBAC capability on `tenants::tenants` (via `withMeta` + `rbac` middleware). This dual gate ensures that even within NapSoft, only users with the appropriate RBAC role (e.g., `admin`) can manage tenants. The `admin` role is seeded with `tenants::tenants::full` and `tenants::nap-users::full` policies.
**Enforcement:** `tenantsRouter.js` applies `[requireNapsoftTenant, withMeta({ module: 'tenants', router: 'tenants' }), rbac()]` middleware chain. BR-RBAC-006 updated — admin role is no longer blanket-blocked from tenants module; access is now policy-driven.

---

### BR-RBAC-046
**Rule:** App user accounts (`admin.nap_users`) are driven by the employee entity. Employees have an `is_app_user` boolean and `email` field. When `is_app_user` is toggled on, a corresponding `nap_users` record is created with status `'invited'` and a temporary password. When toggled off, the `nap_users` record is deactivated. The `nap_users.employee_id` FK links back to the originating employee.
**Enforcement:** `employeesController.js` handles the `is_app_user` lifecycle in create and update methods.

---

### BR-RBAC-047
**Rule:** When a new tenant is provisioned, the RBAC seed automatically creates `admin` and `project_manager` roles with default policies. The user who created the tenant is auto-assigned the `admin` role as their primary role via `role_members`. This ensures the creating user has immediate access to manage the new tenant's RBAC configuration.
**Enforcement:** `seed_rbac.js` — inserts `role_members` row linking `createdBy` user to the `admin` role with `is_primary: true`.

---

### BR-RBAC-048
**Rule:** Only one impersonation session may be active per impersonator at any time. Starting a new impersonation while one is already active returns `409 Conflict`. The impersonator must explicitly exit the current session before starting a new one. Active sessions are tracked via `imp:{userId}` Redis keys.
**Enforcement:** `adminController.startImpersonation()` checks for existing `imp:{userId}` key before creating a new session. `adminController.endImpersonation()` deletes the key and timestamps `ended_at` in the audit log.

---

## Changelog

| Date | Change | Author |
|---|---|---|
| 2025-02-17 | Initial registry created — 20 rules from PRD §3.1 and §3.2 | NapSoft |
| 2025-02-17 | BR-RBAC-006 updated — added UI Behavior note and link to ui-visibility.md | NapSoft |
| 2025-02-17 | BR-RBAC-021 added — tenant scoping for admin user queries | NapSoft |
| 2025-02-18 | ADR reference updated from ADR-0004 to ADR-0013 (four-layer scoped RBAC) | NapSoft |
| 2025-02-18 | BR-RBAC-022 through BR-RBAC-036 added — Layers 2-4 (scope, state filters, field groups), multi-role merge semantics, opt-in enforcement, cache invalidation, tenant configurability | NapSoft |
| 2025-02-18 | BR-RBAC-004/006 scope expanded by BR-RBAC-032 — super_user and admin now bypass all four layers, not just Layer 1 | NapSoft |
| 2026-02-20 | BR-RBAC-024 updated — scope now includes `assigned_companies` (three-tier hierarchy) | NapSoft |
| 2026-02-20 | BR-RBAC-029 updated — three-tier scope merge with SCOPE_ORDER | NapSoft |
| 2026-02-20 | BR-RBAC-035 updated — added `company_members` to cache invalidation list | NapSoft |
| 2026-02-20 | BR-RBAC-037 through BR-RBAC-042 added — three-tier scope hierarchy, assigned_companies, policy_catalog, router naming convention, company_members cache invalidation | NapSoft |
| 2026-02-21 | BR-RBAC-006 updated — admin role now uses RBAC capability `tenants::tenants` instead of blanket block; dual gate with requireNapsoftTenant | NapSoft |
| 2026-02-21 | BR-RBAC-043 through BR-RBAC-048 added — cross-tenant access, impersonation with audit logging, tenants RBAC gate, employee-driven user lifecycle, auto-role assignment, impersonation session uniqueness | NapSoft |
