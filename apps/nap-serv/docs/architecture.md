# Architecture Overview

`nap-serv` is the backend for the Next-Gen Accounting Platform (NAP). It exposes a modular Express
API backed by PostgreSQL with strong tenant isolation. This document summarises the application
architecture so new contributors can understand how requests move through the system and how modules
are composed.

---

## System Snapshot

- **Runtime**: Node.js (ESM only) with Express 5.
- **Data store**: PostgreSQL, tenant-per-schema pattern (`tenant_ast`, `tenant_xyz`, ...).
- **Schema orchestration**: [`pg-schemata`](https://www.npmjs.com/package/pg-schemata) plus custom
  migrator (`src/db/migrations`).
- **Caching**: Redis for auth context and RBAC policy caches.
- **Client**: `apps/nap-client` (Vite/React) consumes the REST API over HTTPS.
- **Logging**: Winston transports + Morgan JSON formatter, per-request `tenantId` and `userId` labels.

---

## Tenancy Model

Each tenant (customer) gets a dedicated PostgreSQL schema. Tenant isolation rules:

- No cross-schema joins for business data.
- Tables include both `tenant_id` (UUID) and `tenant_code` (short code).
- Unique constraints rely on schema isolation; `tenant_code` stays out of PK/UK definitions.
- Middleware (`authRedis`) resolves schema + tenant context for every authenticated request.
- Migrations run separately for:
  - **Admin scope** (`schema = 'admin'`): manages `tenants`, global `nap_users`, RBAC seeds.
  - **Tenant scope**: per-tenant tables (projects, activities, AP/AR, etc).

The migrator (`moduleRegistry.js`) controls which modules apply to each scope. Adding a module requires
registering both its repositories and migration index there.

---

## Request Flow

1. **HTTP** hits Express `app` (`src/app.js`).
2. Global middleware stack executes:
   - CORS + body parsing + cookies
   - `authRedis()` verifies the JWT cookie, loads cached permissions, sets `req.ctx`
   - Morgan logs request metadata to Winston
3. Router dispatch under `/api` delegates to feature routers defined in `modules/<feature>/apiRoutes/v1`.
4. Controllers invoke `pg-schemata` models with schema-qualified queries
   (`schema.table` rather than `SET search_path`).
5. Domain rules often create journal entries or other derived records within a transaction.

---

## Module Inventory

Enabled modules (see `src/db/moduleRegistry.js`):

| Module    | Scope   | Responsibility                                               |
|-----------|---------|--------------------------------------------------------------|
| `tenants` | admin   | Tenant provisioning, nap user catalog, admin APIs           |
| `core`    | tenant  | Shared entities (addresses, contacts, vendors, clients, employees) |
| `views`   | tenant  | Materialised/reporting views for cross-module queries       |
| `projects`| tenant  | Projects, units, task templates, cost items, change orders  |
| `bom`     | tenant  | Bill-of-materials, catalog integrations                     |

Additional modules live in the tree (`activities`, `ap`, `ar`, `accounting`) and expose routers, but
they’re still being migrated through the new module registry. When enabling them, update
`moduleRegistry.js` and ensure migrations are registered.

Routers mirror this structure (see `src/apiRoutes.js`):

```plaintext
/api
  /accounting/v1/...
  /activities/v1/...
  /ap/v1/...
  /ar/v1/...
  /bom/v1/...
  /core/v1/...
  /projects/v1/...
  /tenants/v1/...
```

Versioning is delegated to each feature router (`router.use('/v1/...')`). Future versions mount side by
side.

---

## Data Model Highlights

- **Projects & Units** form the backbone of budgeting and actual cost comparisons.
- **Activities & Cost Lines** live under the `activities` module to standardise labour/material buckets.
- **Accounting** modules (GL, AP, AR) share the same RBAC and tenant isolation rules, feeding journal
  entries for financial reporting.
- **Change Orders** extend approved budgets and integrate with cost tracking to enforce budget controls.
- **Reporting Views** under `views` consolidate cross-module metrics (profitability, budget vs actuals).

For detailed table relationships, refer to [`domain-model.md`](./domain-model.md).

---

## Operational Concerns

- **Logging**: `apiLogger` (Winston) writes structured logs; rotate with `winston-daily-rotate-file`.
- **Configuration**: Environment variables follow `NAP_SERV_*` convention; see `.env.example`.
- **Error handling**: Controllers throw `BaseController` errors or return structured JSON
  (`{ error, message }`).
- **Future improvements**:
  - Migrate JWT verification to RS256 (documented in [`auth-rbac.md`](./auth-rbac.md))
  - Expand module registry to include AP/AR/accounting migrations
  - Integrate queueing for long-running tasks (imports, document generation)

---

## See Also

- [`developer-guide.md`](./developer-guide.md) – How to contribute, coding & schema conventions
- [`domain-model.md`](./domain-model.md) – Detailed domain rules for budgeting, costing, AP/AR
- [`auth-rbac.md`](./auth-rbac.md) – Authentication flow, permissions cache, RBAC schemas
