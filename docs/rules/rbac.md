# Business Rules — RBAC (Role-Based Access Control)

**Domain:** Authentication & Authorization
**Last Updated:** 2025-02-17
**Status:** Active — expand with enforcement details as implementation progresses
**ADR Reference:** ADR-0004 (Three-level RBAC over boolean permissions)

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

---

## Rules

### BR-RBAC-001
**Rule:** Permission levels are strictly ordered: `none` (0) < `view` (1) < `full` (2).
**Enforcement:** RBAC middleware — `rbac(requiredLevel)` compares numeric level values.

---

### BR-RBAC-002
**Rule:** Policy resolution follows a specificity hierarchy. The most specific matching policy wins.
Resolution order:
1. `module::router::action` (e.g., `ar::invoices::approve`)
2. `module::router::` (e.g., `ar::invoices::`)
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
**Rule:** The `admin` role grants full access within a tenant but is explicitly blocked from the `tenants` module (NapSoft-only operations).
**Enforcement:** `requireNapsoftTenant` middleware on all `/api/tenants/` routes.
**UI Behavior:** The "Manage Tenants" sidebar navigation item is not rendered for any user who is not a NapSoft employee. Visibility is determined by `isNapsoftEmployee()` checked against `AuthContext` — not by permission level. See [UI-VIS-001](./ui-visibility.md#ui-vis-001).

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

## Changelog

| Date | Change | Author |
|---|---|---|
| 2025-02-17 | Initial registry created — 20 rules from PRD §3.1 and §3.2 | NapSoft |
| 2025-02-17 | BR-RBAC-006 updated — added UI Behavior note and link to ui-visibility.md | NapSoft |
| 2025-02-17 | BR-RBAC-021 added — tenant scoping for admin user queries | NapSoft |
