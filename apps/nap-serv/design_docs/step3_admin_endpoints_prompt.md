# Implementation Prompt — Step 3 (Admin Endpoints & super_admin CRUD)

## Objective

Add new **admin-only APIs** for tenant visibility + nap_user visibility, and unify super_admin CRUD into the standard employees flow (inside the ADMIN tenant). Extend RBAC + audit rules accordingly.

## Preconditions (Steps 1 & 2)

- Auth/admin controllers live in `modules/core`.
- Bootstrap script provisions `ADMIN` tenant with modules: core, gl, ap, ar.
- super_admin users exist in `admin` schema with role assignments.

---

## Deliverables

### 1) Tenants: view + update (admin-only)

**Endpoints (core, mounted at `/api/v1/admin/tenants`)**

- `GET   /` — list tenants (filters: `q`, `status=active|archived`).
- `GET   /:id` — detail, incl. schema version + enabled modules.
- `PATCH /:id` — update metadata only (name, contact, status notes, plan, allowed_modules).
- `POST  /` — create tenant (creates schema + seeds).
- `POST  /:id/archive` — already have.
- `POST  /:id/restore` — already have.

**Rules**

- No cross-tenant SQL joins. Use `platform.tenants` + per-tenant service checks (ping schema, version).
- Guardrails:
  - Cannot archive `ADMIN` tenant.
  - Cannot disable last auth-required module (core).

### 2) nap_users: central view (read-only)

**Endpoints (core, mounted at `/api/v1/admin/nap-users`)**

- `GET /` — index (filters: `tenant_code`, `email`, `status`).
- `GET /:id` — detail.

**No create/update/delete here.**  
Tenant-scoped mutations remain under `employees` API (after `assume-tenant`).

### 3) super_admin (ADMIN tenant) CRUD via employees API

- Reuse `/api/v1/employees` endpoints inside `admin` schema:
  - `POST   /employees` — create super_admin user + employee row.
  - `PATCH  /employees/:id` — update.
  - `DELETE /employees/:id` (or archive) — restrict: cannot remove last active super_admin.
- All CRUD runs in one TX (employee + nap_user + role assignment).

---

## Capability Matrix

| Capability                             | Where             | Method                                                 |
| -------------------------------------- | ----------------- | ------------------------------------------------------ |
| View tenants                           | core/admin schema | `GET /api/v1/admin/tenants[/:id]`                      |
| Update tenant metadata/modules         | core/admin schema | `PATCH /api/v1/admin/tenants/:id`                      |
| Archive/restore tenant                 | core/admin schema | (already present)                                      |
| View nap_users (any tenant)            | core/admin schema | `GET /api/v1/admin/nap-users[/:id]` (read-only)        |
| Create/update/delete tenant users      | target tenant     | via `employees` API (assume-tenant required)           |
| Create/update/delete super_admin users | ADMIN tenant      | via `employees` API under ADMIN context                |
| Assume tenant                          | core/admin schema | `POST /api/v1/admin/assume-tenant` / `exit-assumption` |
| Archive/restore nap_users              | target tenant     | (already present; keep)                                |

---

## RBAC + Audit

- **RBAC**: All `/api/v1/admin/*` endpoints require `super_admin` role.
- **Audit**: Log into `admin.admin_activity_log`:
  - tenant updates (PATCH, archive, restore, create)
  - impersonation events
  - super_admin CRUD

JWT claims during impersonation (unchanged from Step 1):

```json
{
  "sub": "super_admin-id",
  "tenant_code": "ACME",
  "assumed": true,
  "actor": "super_admin-id",
  "on_behalf_of": "ACME",
  "assume_expires_at": 1735689600
}
```

---

## Example Router Layout (ESM)

```js
// modules/core/apiRoutes/v1/adminTenants.router.js
import { Router } from 'express';
import rbac from '../../middlewares/rbac.js';
import * as ctl from '../../controllers/admin/tenants.controller.js';

const r = Router();
r.use(rbac('super_admin'));

r.get('/', ctl.list);
r.get('/:id', ctl.getOne);
r.post('/', ctl.create);
r.patch('/:id', ctl.updateMeta);
r.post('/:id/archive', ctl.archive);
r.post('/:id/restore', ctl.restore);

export default r;
```

```js
// modules/core/apiRoutes/v1/adminUsers.router.js (read-only nap_users)
import { Router } from 'express';
import rbac from '../../middlewares/rbac.js';
import * as ctl from '../../controllers/admin/napUsers.controller.js';

const r = Router();
r.use(rbac('super_admin'));

r.get('/', ctl.list);
r.get('/:id', ctl.getOne);

export default r;
```

---

## Tests to Add (Vitest)

- **Tenants**:
  - List returns expected tenants; supports filters.
  - Detail includes schema version + modules.
  - PATCH updates name/plan only; cannot rename schema.
  - Guard: cannot archive `ADMIN`.
- **nap_users**:
  - GET index with filters returns correct rows.
  - GET detail returns user scoped to tenant.
- **super_admin CRUD** (in `admin` schema):
  - POST creates nap_user + employee + role in one TX.
  - PATCH updates names/roles correctly.
  - DELETE/archive fails if it would remove last active super_admin.
- **RBAC**:
  - Non-super_admin → 403 on `/api/v1/admin/*`.
- **Audit**:
  - Each admin action inserts row into `admin.admin_activity_log`.

---

## Extra (Optional)

- `GET /api/v1/admin/tenants/:id/health` — return schema version + pending migrations.
- `POST /api/v1/admin/tokens/revoke` — force logout for a nap_user.
- Async export endpoint: trigger background job to dump tenant data.

---

## Non-functional

- ESLint + Prettier pass.
- Conventional Commit: `feat(core): add admin tenant/nap_user endpoints and super_admin CRUD`
- Update README: document new admin endpoints, RBAC rules, and audit.
