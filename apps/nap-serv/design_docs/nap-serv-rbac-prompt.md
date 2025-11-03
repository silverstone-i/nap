# Prompt: Implement RBAC (“brace”) in `apps/nap-serv`

## Goal

Implement server-side RBAC with 3 levels (`none` < `view` < `full`) and 3 scopes (module → router → action; most specific wins). Enforce per-tenant using pg-schemata. Provide a minimal client-consumable caps API. Server is always source-of-truth.

## Context (nap-serv)

- Node 20+ ESM, Express, PostgreSQL, **pg-schemata**, per-tenant schemas.
- No cross-tenant joins. Every table has `tenant_id` + `tenant_code` (never in PK/UK).
- JWTs: 15-min access, 7-day refresh (secure cookies). Auth middleware injects `req.ctx`.

## System & Tenant Roles

- **System roles (immutable):**
  - `super_admin`: full across all tenants/modules.
  - `admin`: full within current tenant **except** `tenants` module (no direct CRUD on global `nap_users`; only via controlled flows).
- **Tenant roles:** created by tenant admins; policies stored in DB.

## File Layout (create/update exactly)

```
apps/nap-serv/
  src/
    middlewares/
      rbac.js
    utils/
      routeMeta.js
    seeds/
      seed_rbac.js
    app.js
  core/
    apiRoutes/v1/            # existing routers; you’ll add guards
      ar/invoices.router.js  # use as example site for guards
    models/
      Roles.js
      RoleMembers.js
      Policies.js
      RbacPolicies.js
    schema/
      roles.schema.js
      role_members.schema.js
      policies.schema.js
  test/rbac/
    rbac.policy-resolution.test.js
    rbac.system-roles.test.js
    rbac.tenants-module-deny.test.js
    rbac.action-deny-override.test.js
```

## Schemas (pg-schemata)

Implement **exactly**:

- `roles.schema.js`
  - PK `id uuid default gen_random_uuid()`
  - `tenant_id uuid NULL`, `tenant_code text NULL`
  - `code text NOT NULL` (stable key), `name text NOT NULL`, `description text NULL`
  - `is_system boolean NOT NULL default false`, `is_immutable boolean NOT NULL default false`
  - UK `(tenant_id, code)`; indexes on `tenant_id`, `code`
- `role_members.schema.js`
  - PK `id uuid default gen_random_uuid()`
  - `tenant_id`, `tenant_code`
  - `role_id uuid NOT NULL` (→ roles.id), `user_id uuid NOT NULL` (→ global `nap_users.id`)
  - `is_primary boolean NOT NULL default false`
  - UK `(role_id, user_id)`; indexes on `role_id`, `user_id`, `tenant_id`
- `policies.schema.js`
  - PK `id uuid default gen_random_uuid()`
  - `tenant_id`, `tenant_code`
  - `role_id uuid NOT NULL` (tenant role)
  - `module text NOT NULL`, `router text NULL`, `action text NULL`
  - `level text NOT NULL` with CHECK in (`none`,`view`,`full`)
  - UK `(role_id, module, router, action)`; indexes on `(module, router, action)` and `role_id`

> All tables include audit fields per repo convention.

## Models

Create thin ESM models extending your `TableModel`:

- `Roles.js`, `RoleMembers.js`, `Policies.js` — export classes with `static schema = …`.
- `RbacPolicies.js` — export:
  - `loadPoliciesForUserTenant({ db, tenantId, userId }) → { "module::router::action": "none|view|full" }`
    - Steps: find user’s tenant roles via `role_members`, load all `policies` for those roles, flatten to a map (most-specific resolution happens at runtime, not here).

## Middleware

- `src/utils/routeMeta.js`
  - `export const withMeta = ({ module, router, action, desired }) => (req,_res,next) => { req.resource = { module, router, action, desired }; next(); }`
- `src/middlewares/rbac.js`
  - `export const rbac = (requiredHint /* 'view'|'full' | undefined */) => async (req,res,next) => { … }`
  - Pull `{ user, tenant, roles, system_roles }` from `req.ctx`.
  - **Short-circuits**:
    - if `system_roles` includes `super_admin` → `next()`
    - else if `system_roles` includes `admin` **for this tenant** → allow unless `req.resource.module === 'tenants'` (then 403)
  - Else resolve effective level from flattened policies:
    - Keys tried in order:  
      `m::r::a` → `m::r::` → `m::::` → default `none`
  - Determine **required**:
    - If `requiredHint` provided, use it; else infer from method: GET/HEAD ⇒ `view`, others ⇒ `full`.
    - Some GETs (like approve links) must still pass `rbac('full')` — rely on router annotations.
  - If effective < required ⇒ `403` with `{ needed, have, module, router, action }`.

## Seeding

- `src/seeds/seed_rbac.js`
  - Create system roles (tenant_id NULL): `super_admin`, `admin` (`is_system=true`, `is_immutable=true`)
  - For a sample tenant `{tenantId, tenantCode}` create role `project_manager` with policies:
    - `('projects', null, null) = full`
    - `('gl', null, null) = view`
    - `('ar', null, null) = view`
    - `('ar', 'invoices', 'approve') = none`

## Router Integration (example)

Update one router to demonstrate:

```js
// apps/nap-serv/core/apiRoutes/v1/ar/invoices.router.js
import { Router } from 'express';
import { withMeta } from '../../../src/utils/routeMeta.js';
import { rbac } from '../../../src/middlewares/rbac.js';
const router = Router();
const base = { module: 'ar', router: 'invoices' };

router.get(
  '/:id',
  withMeta({ ...base, action: 'get', desired: 'view' }),
  rbac('view'),
  getInvoice,
);
router.post(
  '/:id/approve',
  withMeta({ ...base, action: 'approve', desired: 'full' }),
  rbac('full'),
  approveInvoice,
);

export default router;
```

## Client-facing RBAC (minimal)

- Add **two endpoints**:
  - `GET /api/v1/auth/me` → `{ user, tenant, system_roles, tenant_roles, policy_etag }`
  - `GET /api/v1/rbac/effective?tenantId=…` → `{ policy_etag, caps: { "m::::": "view", "m::r::": "full", "m::r::a": "none" } }`
- Compute `policy_etag` = stable hash over the tenant’s roles/policies.
  - Add a small table `rbac_state(tenant_id, policy_etag, updated_at)` or compute on the fly and cache.
  - **DB triggers** on `roles`, `role_members`, `policies` to bump `policy_etag` on change.

## Staleness

- Server **always** enforces DB; client RBAC is advisory.
- Include `policy_etag` in access JWT and `/me`. Client refetches `/rbac/effective` when etag changes or on 403.

## Acceptance Tests (write under `test/rbac`)

1. **Resolution order**: action overrides router overrides module; default is `none`.
2. **System roles**: `super_admin` passes everywhere; tenant `admin` denied on `tenants` module.
3. **Deny override**: with module=view, router=view, action=none → action endpoint returns 403.
4. **Verb inference**: GET allowed by `view`; POST requires `full` unless route explicitly set to `view`.
5. **Tenant isolation**: policies from tenant A never grant access in tenant B.
6. **Policy map**: `/rbac/effective` returns flattened caps and a stable `policy_etag`.
7. **403 recovery**: when policies change to remove permission, previously allowed POST now 403s; `/me` reveals new etag.

## Coding Standards

- ESM imports, no CommonJS.
- Schema-qualified queries via pg-schemata; include `tenant_id`/`tenant_code` on inserts.
- Deny-by-default. No route should skip `rbac`.
- Log 403s with `{ userId, tenantId, module, router, action, method, needed, have }`.

## Deliverables

- New/updated files as above, compiling without type errors.
- Passing RBAC tests.
- Example router wired with `withMeta` + `rbac`.
- Seed script runnable via repo’s seed harness.

> When done, output a concise summary of created files, and any commands required to run seeds/tests (e.g., `npm -w apps/nap-serv run seed:rbac`, `npm -w apps/nap-serv test -t rbac`).
