# NAP - Product Requirements Document

## 1. Overview

### 1.1 Product Vision

NAP (Next Generation Accounting Platform) is a **multi-tenant, modular construction and project management ERP** designed for property development, homebuilding, and general contracting companies. It provides end-to-end management of projects, budgets, cost tracking, vendor relationships, accounts payable/receivable, general ledger accounting, intercompany operations, and **project-level cashflow and profitability analysis** — all within a schema-isolated multi-tenant architecture.

> **Build Approach:** This application is built from scratch (greenfield). All server-side data access, schema management, migrations, and CRUD operations leverage **pg-schemata 1.3.0** — an owned, extensible PostgreSQL ORM layer. Since NapSoft owns the pg-schemata repository, features can be added and bugs fixed as needed to support NAP requirements.

### 1.2 Target Users

| Persona | Description |
|---|---|
| **NapSoft Super User** | Platform operator with full access to NapSoft data, cross-tenant access, impersonation, and tenant management |
| **NapSoft Support** | Cross-tenant access, impersonation, and tenant management. No access to NapSoft financial data |
| **Administrator** | Full access within their tenant's data. Same role meaning in every schema |
| **Project Manager** | Creates/manages projects, units, budgets, cost lines, change orders, and actual costs |
| **Accountant / Controller** | Manages chart of accounts, journal entries, AP/AR invoices, and intercompany transactions |
| **AP/AR Clerk** | Processes vendor invoices, payments, client invoices, and receipts |
| **Procurement / BOM Manager** | Manages catalog SKUs, vendor SKU matching, and vendor pricing |
| **CFO / Financial Analyst** | Reviews cashflow dashboards, project profitability reports, and margin analysis |

### 1.3 Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite 7, Material UI 5, React Router 7, TanStack React Query 5 |
| **Backend** | Node.js 20+, Express 5, ES Modules |
| **Database** | PostgreSQL 15+ with schema-per-tenant isolation via `pg-schemata` 1.3.0 |
| **ORM / Data Layer** | `pg-schemata` 1.3.0 (owned) — TableModel, QueryModel, MigrationManager, bootstrap |
| **Caching** | Redis (permission caching, token staleness detection) |
| **Auth** | JWT (HS256) in httpOnly cookies, Passport.js Local Strategy, bcrypt |
| **AI/ML** | pgvector + OpenAI embeddings (text-embedding-3-large) for SKU matching |
| **Testing** | Vitest (unit, integration, contract, RBAC suites) |
| **Tooling** | npm workspaces monorepo, ESLint, Prettier, Husky pre-commit hooks |

### 1.4 Monorepo Structure

```
nap/
  apps/
    nap-client/     # React SPA frontend
    nap-serv/       # Express API backend
  packages/
    shared/         # Shared utilities/constants
```

---

## 2. Architecture

### 2.1 Multi-Tenant Model

NAP uses **PostgreSQL schema-per-tenant** isolation powered by pg-schemata:

- **`admin` schema**: System-wide tables (`tenants`, `nap_users`, `match_review_logs`, `impersonation_logs`)
- **Tenant schemas** (e.g., `acme`, `nap`): Each customer gets a dedicated PostgreSQL schema containing all business tables (vendors, projects, accounting, etc.)
- Tenant resolution is performed per-request via `x-tenant-code` header or JWT claims
- All database access is schema-aware via pg-schemata's `setSchemaName()` — models bind queries to the correct tenant schema dynamically

### 2.2 pg-schemata Integration (Owned Dependency)

NAP is built entirely on **pg-schemata 1.3.0**. Since NapSoft owns the pg-schemata repository, the library can be extended with new features or patched as NAP requirements evolve.

#### 2.2.1 Core Capabilities Used

| pg-schemata Feature | NAP Usage |
|---|---|
| **DB.init()** | Singleton database initialization with all model repositories |
| **TableModel** | Base class for all writable business models — provides insert, update, delete, bulk operations, upsert, soft delete, import/export |
| **QueryModel** | Base class for read-only views — provides findById, findWhere, findAfterCursor (keyset pagination), countWhere, exists, aggregation |
| **Schema Definitions** | All table structures defined as JavaScript schema objects with columns, constraints, indexes, and foreign keys |
| **Audit Fields** | `hasAuditFields: { enabled: true, userFields: { type: 'uuid' } }` — auto-managed created_at/by, updated_at/by |
| **Soft Delete** | `softDelete: true` — deactivated_at column with automatic filtering on reads |
| **Generated Columns** | `generated: 'always'` with `expression` for computed fields (e.g., `amount = quantity * unit_cost`) |
| **Zod Validation** | Auto-generated insert/update validators from schema definitions via `generateZodValidator()` |
| **ColumnSet Caching** | LRU cache (20K entries, 1-hour TTL) for pg-promise ColumnSets |
| **MigrationManager** | Versioned migrations with SHA-256 checksums, advisory locks, per-schema tracking |
| **bootstrap()** | Single-transaction table creation from model map with extension setup |
| **Audit Actor Resolver** | `setAuditActorResolver()` — resolves current user from AsyncLocalStorage for audit trails |
| **Excel Import/Export** | `importFromSpreadsheet()` / `exportToSpreadsheet()` built into TableModel |
| **Error Classes** | `DatabaseError` (PG error codes: 23505 unique, 23503 FK) and `SchemaDefinitionError` |

#### 2.2.2 WHERE Clause Query Operators

All models inherit pg-schemata's rich query builder:

| Modifier | SQL | Example |
|---|---|---|
| `$like` | LIKE | `{ name: { $like: '%lumber%' } }` |
| `$ilike` | ILIKE | `{ name: { $ilike: '%lumber%' } }` |
| `$from` / `$to` | >= / <= | `{ created_at: { $from: '2025-01-01', $to: '2025-12-31' } }` |
| `$in` | IN | `{ status: { $in: ['active', 'pending'] } }` |
| `$eq` / `$ne` | = / != | `{ status: { $ne: null } }` |
| `$is` / `$not` | IS NULL / IS NOT NULL | `{ deleted_at: { $is: null } }` |
| `$and` / `$or` | Nested boolean | `{ $or: [{ status: 'open' }, { status: 'sent' }] }` |

#### 2.2.3 Model Definition Pattern

Every NAP model follows this pattern:

```javascript
import { TableModel } from 'pg-schemata';

const vendorsSchema = {
  dbSchema: 'tenant',          // Overridden at runtime via setSchemaName()
  table: 'vendors',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', immutable: true, colProps: { cnd: true } },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'name', type: 'varchar(128)', notNull: true },
    { name: 'code', type: 'varchar(16)' },
    // ...
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [{ columns: ['tenant_id', 'code'], nullsNotDistinct: true }],
    foreignKeys: [
      { columns: ['source_id'], references: { table: 'sources', columns: ['id'] }, onDelete: 'CASCADE' }
    ],
    indexes: [
      { columns: ['tenant_id'] },
      { columns: ['tenant_id', 'code'], unique: true, where: 'deactivated_at IS NULL' }
    ]
  }
};

export class Vendors extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, vendorsSchema, logger);
  }

  // Custom business methods extend TableModel
  async findByCode(tenantId, code) {
    return this.findOneBy([{ tenant_id: tenantId, code }]);
  }
}
```

#### 2.2.4 Database Initialization

```javascript
import { DB, db } from 'pg-schemata';
import { Vendors } from './models/Vendors.js';
// ... all model imports

DB.init(process.env.DATABASE_URL, {
  vendors: Vendors,
  clients: Clients,
  projects: Projects,
  // ... all model registrations
}, logger);

// Access: db().vendors.insert({ ... })
```

#### 2.2.5 Potential pg-schemata Enhancements (Owned Repo)

Features that may need to be added to pg-schemata to support NAP:

| Enhancement | Purpose |
|---|---|
| **Aggregate query helpers** | Built-in SUM/AVG/GROUP BY support for profitability rollups |
| **Raw SQL escape hatch** | Safe parameterized raw query method for complex reporting views |
| **Batch schema operations** | Create/drop multiple tenant schemas in a single call |
| **Event hooks** | Pre/post insert/update hooks for GL posting triggers |
| **Connection tagging** | Tag connections with tenant context for pg_stat monitoring |

### 2.3 Application Layout

The UI follows a four-zone layout architecture:

```
+-----------------------------------------------------------+
| SIDEBAR   | TENANT BAR (sticky top, 48px)                 |
| (sticky   |-------------------------------------------------|
|  left,    | MODULE BAR (sticky, dynamic toolbar)           |
|  full     |-------------------------------------------------|
|  height,  | DATA VIEWPORT (main content area, flex: 1)     |
|  242px    | Page-specific content renders here via Outlet   |
|  or 110px)|                                                 |
+-----------+-------------------------------------------------+
```

- **Tenant Bar**: Tenant selector dropdown, user avatar with profile/settings dropdown
- **Module Bar**: Displays the current module name on the left with breadcrumb navigation (e.g., `Admin > Manage Employees`), plus dynamic toolbar actions (tabs, filters, primary action buttons) on the right
- **Sidebar**: Collapsible navigation with up to 3 levels of nesting (group → sub-module → leaf item); supports flyout menus when collapsed
- **Data Viewport**: Main content area where page components render

### 2.4 Request Flow

```
Browser -> Vite Dev Proxy (/api -> :3000) -> Express
  -> CORS -> JSON/Cookie parsing -> Morgan logging
  -> authRedis() [JWT verify, tenant resolve, permission load]
  -> /api/<module>/v1/<resource>
  -> [addAuditFields] -> [rbac()] -> Controller -> pg-schemata Model (schema-aware)
  -> Response
```

---

## 3. Feature Modules

### 3.1 Authentication & Authorization (Core)

#### 3.1.1 Authentication

**Login Flow:**
1. User submits email/password on `LoginPage`
2. Client calls `POST /api/auth/login` via `api.login()`
3. Server validates via Passport Local Strategy (bcrypt hash comparison against `admin.nap_users`)
4. Server loads RBAC policies, caches in Redis, signs JWT tokens
5. Server sets `auth_token` (15min) and `refresh_token` (7-day) as httpOnly cookies
6. Client calls `GET /api/auth/me` to hydrate user context
7. `AuthContext` stores user state; `LayoutShell` guards authenticated routes

**Endpoints:**
| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/login` | Authenticate with email/password |
| `POST` | `/api/auth/refresh` | Rotate tokens (full rotation) |
| `POST` | `/api/auth/logout` | Clear auth cookies |
| `POST` | `/api/auth/change-password` | Change password (validates current password, enforces strength rules) |
| `GET` | `/api/auth/me` | Get current user context, tenant, roles, permissions, impersonation state |
| `GET` | `/api/auth/check` | Lightweight session validation |

**Token Claims:**
- `sub`: User UUID
- `ph`: Permissions hash for cache validation (nullable)
- `iss`: Issuer (`'nap-serv'`)
- `aud`: Audience (`'nap-serv-api'`)

> **Note:** Authentication is against `admin.nap_users` which contains only identity/auth fields (`id`, `tenant_id`, `entity_type`, `entity_id`, `email`, `password_hash`, `status`). Tenant context (`tenant_code`, `schema_name`) and roles are resolved at request time by the `authRedis` middleware via HTTP headers, Redis cache, and database lookup — they are NOT embedded in the JWT. Roles are read from the entity record's `roles` text array (resolved via `entity_type` + `entity_id`), not from a column on `nap_users`.

**Client-Side Auth:**
- `AuthContext` provides `{ user, loading, login, logout, refreshUser, tenant, isNapSoftUser, assumedTenant, assumeTenant, exitAssumption, impersonation, startImpersonation, endImpersonation }` via React context, where `tenant` is `null` or `{ tenant_code, schema_name }`
- `LayoutShell` renders loading spinner while `loading=true`, redirects to `/login` if `user=null`
- All API calls use `credentials: 'include'` for cookie transmission
- No tokens stored in localStorage — fully cookie-based

#### 3.1.2 Role-Based Access Control (RBAC)

> **ADR Reference:** [ADR-0013](./decisions/0013-four-layer-scoped-rbac.md) (supersedes [ADR-0004](./decisions/0004-three-level-rbac.md))

RBAC uses a four-layer model where each layer narrows what the previous layer grants. Layers 2-4 never expand access beyond what Layer 1 allows.

| Layer | Question | Mechanism |
|-------|----------|-----------|
| **1 — Role Policies** | What can this role DO? | `policies` table — `none`/`view`/`full` levels |
| **2 — Data Scope** | HOW MUCH data? | `roles.scope` + `project_members` + `company_members` tables |
| **3 — State Filters** | Which record STATES? | `state_filters` table |
| **4 — Field Groups** | Which COLUMNS? | `field_group_definitions` + `field_group_grants` tables |

**Layer 1 — Data Model:**
- `roles`: Role definitions with `code`, `name`, `description` (optional), `is_system`, `is_immutable`, `scope` (`all_projects`, `assigned_companies`, `assigned_projects`, or `self`), plus `tenant_code`
- `policies`: Permission grants with `(role_id, module, router, action, level)` dimensions, plus `tenant_code`

> **Role Assignment:** Roles are stored as a `roles` text array directly on each entity table (employees, vendors, clients, contacts) — there is no `role_members` junction table. The permission loader reads the `roles` array from the entity record (resolved via `nap_users.entity_type` + `entity_id`), then queries `policies` for matching role IDs. A SQL view can reconstruct "members by role" across entity tables when needed for admin reporting.

**Layer 2 — Data Model:**
- `project_members`: Maps `(project_id, user_id)` with a `role` label (e.g., `member`, `lead`). When `roles.scope = 'assigned_projects'`, only data from the user's assigned projects is visible.
- `company_members`: Maps `(company_id, user_id)`. When `roles.scope = 'assigned_companies'`, only data from projects belonging to the user's assigned inter-companies is visible. The permission loader eagerly resolves both `companyIds` and corresponding `projectIds`.
- **`self` scope:** When `roles.scope = 'self'`, the permission loader reads `entity_type` and `entity_id` from `nap_users`. The canon includes `entityType` and `entityId`. `_applyRbacFilters()` maps the entity type to the appropriate FK column on the queried resource (e.g., `vendor_id` for AP invoices, `client_id` for AR invoices, `employee_id` for timecards). This enables portal access where vendors/clients see only their own records.
- `policy_catalog`: Registry of valid `(module, router, action)` combinations for role configuration UI discovery. Seed-only reference data — no audit fields, no tenant_code.

**Layer 3 — Data Model:**
- `state_filters`: `(role_id, module, router, visible_statuses[])`. Restricts which record statuses are visible per role per resource. Empty = no filtering (all statuses visible).

**Layer 4 — Data Model:**
- `field_group_definitions`: Named column groups per resource — e.g., `(module, router, group_name, columns[], is_default)`.
- `field_group_grants`: Assigns field groups to roles. Definitions with `is_default = true` are granted to all roles automatically. Empty = all columns visible.

> **RBAC Schema Storage:** RBAC tables are defined with `dbSchema: 'public'` as a placeholder, but pg-schemata dynamically overrides the schema at bootstrap/migration time. Each tenant schema gets its own copy of all RBAC tables.

**Permission Levels (Layer 1):** `none` (0) < `view` (1) < `full` (2)

**Policy Resolution (most specific to least):**
1. `module::router::action` (e.g., `ar::ar-invoices::approve`)
2. `module::router::` (e.g., `ar::ar-invoices::`)
3. `module::::` (e.g., `ar::::`)
4. Default: `none`

**Multi-role Merge:**
- Layer 2 scope: most permissive wins — four-tier hierarchy: `all_projects` > `assigned_companies` > `assigned_projects` > `self`
- Layer 3 statuses: union of visible statuses across roles
- Layer 4 columns: union of granted columns across roles

**Built-in System Roles:**

All roles — including system roles — go through the full RBAC policy resolution. There are no bypass or short-circuit paths in the middleware.

- `super_user` (NapSoft `nap` schema only): Full access to all NapSoft data + cross-tenant access + impersonation + tenant management. Seeded with `level: 'full'` policies for all modules plus cross-tenant and impersonation policies. Goes through full RBAC policy resolution — no bypass.
- `admin` (all tenant schemas): Full access within that tenant's data. Seeded with `level: 'full'` policies for all modules. Same meaning in every schema. Goes through full RBAC policy resolution — no bypass.
- `support` (NapSoft `nap` schema only): Cross-tenant access + impersonation + tenant management. No access to NapSoft financial modules (accounting, AR, AP). Seeded with `level: 'none'` for financial modules + `level: 'full'` for non-financial modules + cross-tenant and impersonation policies. Goes through full RBAC policy resolution.

> **No RBAC Bypass:** The middleware does NOT short-circuit for `super_user` or `admin`. All users are authorized through the same entity `roles` array → `policies` resolution path. This ensures all access is auditable, configurable, and consistent.

**Seeded Tenant Roles:**
- `admin`: Tenant-level administrator, `scope: 'all_projects'`. Seeded with explicit `level: 'full'` policies for ALL modules. When new modules are added to the platform, the module migration seeds admin policies for all existing tenants (see Admin Policy Auto-Seeding below).
- `project_manager`: `scope: 'assigned_projects'`; sample policies: `projects: full`, `accounting: view`, `ar: view`, `ar::ar-invoices::approve: none`; sample state filter: AR invoices restricted to `['approved', 'sent']`
- `controller`: `scope: 'assigned_companies'`; policies: `accounting: full`, `ar: full`, `ap: full`, `projects: view`, `reports: view`. Used for financial controllers who manage accounting across their assigned inter-companies.

**NapSoft-Only Policies:** Cross-tenant and impersonation policies are ONLY seeded in the `nap` schema on `super_user` and `support` roles. These policies cannot be assigned to other tenants' schemas.

**Tenant Configurability:** All roles except `super_user`, `admin`, and `support` are tenant-configurable. Tenants define their own roles, assign scopes, create state filters, and build field groups.

**Permission Canon (cached in Redis):**
- Canonical form: `{ caps, scope, projectIds, companyIds, entityType, entityId, stateFilters, fieldGroups }`
- Stored at `perm:{userId}:{tenantCode}`
- SHA-256 permission hash embedded in JWT (`ph` claim)
- `X-Token-Stale: 1` header signals client when cached permissions diverge from token hash
- `authRedis` middleware reads the `roles` array from the entity record (resolved via `nap_users.entity_type` + `entity_id`), then queries `policies` for matching role IDs — NOT from a `nap_users.role` column or `role_members` table
- `entityType` and `entityId` are included in the canon for `self` scope resolution

**Module Entitlements:**
- `admin.tenants.allowed_modules` (jsonb array of module names) controls which modules a tenant can access
- Enforced by middleware after auth and before RBAC: if `req.resource.module` is not in the tenant's `allowed_modules`, return 403
- Cached in Redis alongside tenant metadata
- Default: empty array (no modules) — must be explicitly configured per tenant/tier
- Managed by NapSoft `super_user` / `support` via tenant management UI

**Enforcement:**
- **Module Entitlement (middleware):** Checks `tenants.allowed_modules` before RBAC — if the tenant doesn't have the module enabled, return 403 regardless of user permissions
- **Layer 1 (middleware):** `withMeta({ module, router, action })` annotates `req.resource` → `rbac(requiredLevel)` enforces; returns 403 on denial. GET/HEAD default to `view`; mutations default to `full`. Permissions are resolved from entity `roles` array → `policies` for ALL users — no role-based bypass or short-circuit.
- **Layers 2-4 (service layer):** `ViewController._applyRbacFilters()` applies scope, state, and field filters. Controllers opt in via `this.rbacConfig = { module, router, scopeColumn, entityScopeColumns }`. The `entityScopeColumns` mapping tells the `self` scope which FK column to filter for each entity type (e.g., `{ vendor: 'vendor_id', client: 'client_id', employee: 'employee_id' }`).

**Admin Policy Auto-Seeding:**
- When a new module is added to the platform, its migration seeds `level: 'full'` policies for the `admin` role in every existing tenant schema
- Ensures `admin` always has complete access without manual intervention
- New tenant provisioning includes admin policies for all modules enabled by the tenant's `allowed_modules`

**RBAC Management Endpoints (tenant-scope, under `/api/core/v1/`):**

| Method | Path | Purpose |
|---|---|---|
| Standard CRUD | `/api/core/v1/roles` | Manage tenant roles (code, name, scope, is_system, is_immutable) |
| Standard CRUD | `/api/core/v1/policies` | Manage per-role permission grants (module, router, action, level) |
| Standard CRUD | `/api/core/v1/policy-catalog` | Read-only catalog of valid (module, router, action) combinations |

> **Role Assignment:** Roles are managed via entity CRUD endpoints (update the `roles` array on the employee/vendor/client/contact record). There is no separate `/role-members` endpoint.

> All RBAC management routes use `createRouter` with `withMeta({ module: 'core', router: '<resource>' })` and `rbac()` middleware.

---

### 3.2 Tenant Management

**Purpose:** NapSoft operators manage customer organizations (tenants) and their users.

**Access Control:** Restricted to NapSoft employees via `requireNapsoftTenant` middleware.

**Root Tenant:** NapSoft (tenant_code `NAP`) is the platform root tenant. It cannot be archived or deleted. The `super_user` and `support` system roles can only be assigned to users belonging to the NapSoft tenant. The root tenant is created automatically during initial setup via the `202502110001_bootstrapAdmin` migration.

#### 3.2.1 Manage Tenants

**Data Model (`admin.tenants`):**

| Field | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `tenant_code` | varchar(6) | Unique short code (e.g., `NAP`, `CAL`) |
| `company` | varchar(128) | Company name |
| `schema_name` | varchar(63) | PostgreSQL schema name |
| `status` | varchar(20) | `active`, `trial`, `suspended`, `pending` |
| `tier` | varchar(20) | `enterprise`, `growth`, `starter` |
| `region` | varchar(64) | Geographic region |
| `allowed_modules` | jsonb | Module access whitelist (enforced by module entitlement middleware — see §3.1.2) |
| `max_users` | integer | User limit (default 5) |
| `notes` | text | Internal notes |

**Tenant Provisioning via pg-schemata:**
- `bootstrap()` creates the new tenant schema and all tables in a single transaction
- Extensions (e.g., `pgcrypto`, `vector`) are created per-schema as needed
- `MigrationManager` applies any pending migrations to the new schema
- Seed data (default roles, chart of accounts templates) is inserted via `bulkInsert()`
- **Admin User Creation:** Performed in a single transaction: (1) create an `employees` record in the tenant schema with `roles: ['admin']`, `is_app_user: true`, `is_primary_contact: true`, (2) create a `nap_users` login in `admin.nap_users` with `entity_type: 'employee'` and `entity_id` linking to the new employee. The employee must have `roles` assigned and `is_app_user = true` before the `nap_users` login is created.
- **Contact Designation:** Primary and billing contacts are designated via `employees.is_primary_contact` and `employees.is_billing_contact` flags — there is no `tenant_role` column on `nap_users`.

**UI Requirements:**
- Data grid displaying: Code, Tenant Name, Status, Tier, Region, Active columns
- Row selection with checkbox (single and multi-select)
- Module Bar actions: **Create Tenant**, **View Details**, **Edit Tenant**, **Archive**, **Restore**
- Status badge display with color coding
- Create tenant form includes admin user fields: email and password (used to create the tenant's Administrator user and linked employee record)
- Pagination with configurable rows-per-page (powered by `findAfterCursor()`)
- Archive cascades to deactivate all associated users (via `removeWhere()`)
- The root tenant (NapSoft, `NAP`) cannot be archived — server rejects the request with 403
- Restore reactivates tenant and all associated users (via `restoreWhere()`)

**Endpoints:**
| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/tenants/v1/tenants` | Create tenant (provisions schema, creates employee with `roles: ['admin']` + nap_users login in single transaction) |
| `GET` | `/api/tenants/v1/tenants` | List tenants (cursor-based pagination) |
| `GET` | `/api/tenants/v1/tenants/:id` | Get tenant by ID |
| `PUT` | `/api/tenants/v1/tenants/update` | Update tenant |
| `DELETE` | `/api/tenants/v1/tenants/archive` | Soft-delete tenant (cascades to users) |
| `PATCH` | `/api/tenants/v1/tenants/restore` | Restore archived tenant |
| `GET` | `/api/tenants/v1/tenants/:id/modules` | Get tenant's allowed modules |

#### 3.2.2 Manage Users

**Data Model (`admin.nap_users`):**

`nap_users` is a pure identity/authentication table. All personal information (name, phone, address, tax_id) lives on the linked entity record (employee, vendor, client, or contact) in the tenant schema. The link is polymorphic via `entity_type` + `entity_id`. Roles are stored as a `roles` text array on the entity record — there is no `role` column on `nap_users` and no `role_members` junction table.

| Field | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `tenant_id` | uuid | FK to tenants |
| `entity_type` | varchar(16) | Entity kind: `'employee'`, `'vendor'`, `'client'`, `'contact'` |
| `entity_id` | uuid | Cross-schema reference to the tenant-schema entity record (not a database FK — enforced by business logic) |
| `email` | varchar(128) | Login identifier, globally unique (partial index WHERE deactivated_at IS NULL) |
| `password_hash` | text | bcrypt hash (never returned in API responses) |
| `status` | varchar(20) | `active`, `invited`, `locked` |

Partial unique index: `(entity_type, entity_id) WHERE deactivated_at IS NULL` — prevents duplicate logins for the same entity.

> **Removed from nap_users:** `tenant_code`, `user_name`, `full_name`, `tax_id`, `notes`, `role`, `tenant_role`, `employee_id`. The `employee_id` column has been replaced by the polymorphic `entity_type` + `entity_id` pair, supporting logins for employees, vendors, clients, and contacts. User identity data lives on the entity record. Roles are stored as a `roles` text array on the entity record (not in a `role_members` junction table). Contact designation (primary/billing) is via `employees.is_primary_contact` / `is_billing_contact`. The `nap_user_phones` and `nap_user_addresses` tables have been removed — phone numbers and addresses are stored on the linked entity via the polymorphic `sources` → `phone_numbers` / `addresses` pattern.

**Access Control:** All nap-users routes are gated by `requireNapsoftTenant` middleware and RBAC enforcement (`tenants::nap-users` capability). GET routes require `view` level; mutations require `full` level.

**Endpoints:**
| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/tenants/v1/nap-users/register` | Register new user (requires existing entity with `roles` assigned and `is_app_user = true`) |
| `GET` | `/api/tenants/v1/nap-users` | List users |
| `GET` | `/api/tenants/v1/nap-users/:id` | Get user by ID |
| `PUT` | `/api/tenants/v1/nap-users/update` | Update user |
| `DELETE` | `/api/tenants/v1/nap-users/archive` | Soft-delete user (prevents self-archival) |
| `PATCH` | `/api/tenants/v1/nap-users/restore` | Restore user (checks tenant is active) |

**Business Rules:**
- Standard POST is disabled; users must be created via the `/register` endpoint
- Registration collects: `email`, `password`, `entity_type`, `entity_id`. The entity must already exist in the tenant schema with `roles` assigned and `is_app_user = true`
- The entity's `roles` array must be non-empty before `is_app_user` can be set to true
- `is_app_user` must be true before a `nap_users` login can be created
- User creation requires the entity to already have `roles` assigned and `is_app_user = true`
- Deactivating an entity (employee, vendor, client, or contact) cascades to lock the corresponding `nap_users` login (business rule in controller, not FK — cross-schema)
- Password automatically hashed with bcrypt on registration
- Email must be globally unique across all active users (enforced by partial unique index WHERE deactivated_at IS NULL)
- Users cannot archive themselves
- `super_user` role cannot be archived
- Restoring a user requires the parent tenant to be active
- NapSoft membership is determined by `tenant_code` comparison: server uses `requireNapsoftTenant` middleware (checks `req.user.tenant_code` against `NAPSOFT_TENANT` env var); client uses `isNapSoftUser` computed flag in `AuthContext` (checks `tenant_code` against `VITE_NAPSOFT_TENANT`)

#### 3.2.3 Admin Operations

**Endpoints:**
| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/tenants/v1/admin/schemas` | List all active tenants (NapSoft users only) |
| `POST` | `/api/tenants/v1/admin/impersonate` | Start impersonation session (requires `target_user_id`) |
| `POST` | `/api/tenants/v1/admin/exit-impersonation` | End active impersonation session |
| `GET` | `/api/tenants/v1/admin/impersonation-status` | Check current impersonation state |

**Cross-tenant access:** NapSoft users send `x-tenant-code` header to switch tenant context — handled by `authRedis` middleware, no dedicated endpoint needed. See [BR-RBAC-043](./rules/rbac.md#br-rbac-043).

**Impersonation Implementation:**
- Audit trail: `admin.impersonation_logs` table records `impersonator_id`, `target_user_id`, `target_tenant_code`, `reason`, `started_at`, `ended_at`
- Session state: active impersonation stored in Redis at `imp:{userId}` with TTL
- Session uniqueness: partial unique index on `impersonation_logs (impersonator_id) WHERE ended_at IS NULL` prevents concurrent sessions; attempting a second session returns `409 Conflict`
- `authRedis` middleware detects active impersonation via Redis key and swaps `req.user` to the target user, setting `req.user.is_impersonating = true` and `req.user.impersonated_by`
- `/auth/me` response includes `impersonation: { active, impersonated_by }` for client-side UI state
- See [BR-RBAC-044](./rules/rbac.md#br-rbac-044), [BR-RBAC-048](./rules/rbac.md#br-rbac-048)

---

### 3.3 Core Entities

**Purpose:** Shared reference data used across all modules — vendors, clients, employees, contacts, addresses, phone numbers, and intercompany entities.

#### 3.3.1 Vendors

| Field | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `tenant_id` | uuid | Not null |
| `source_id` | uuid | FK to sources (CASCADE) |
| `name` | varchar(128) | Not null |
| `code` | varchar(16) | Unique per tenant |
| `tax_id` | varchar(32) | Tax identifier |
| `payment_terms` | varchar(32) | Net terms |
| `roles` | text[] | RBAC role codes assigned to this vendor (default `'{}'`). References `roles.code`. |
| `is_app_user` | boolean | Default false. Must be true before a `nap_users` login can be created. Requires `roles` to be non-empty. |
| `is_active` | boolean | Default true |
| `notes` | text | Internal notes |

**Endpoint:** `/api/core/v1/vendors`

#### 3.3.2 Clients

| Field | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `tenant_id` | uuid | Not null |
| `source_id` | uuid | FK to sources (CASCADE) |
| `name` | varchar(128) | Not null |
| `code` | varchar(16) | Unique per tenant |
| `email` | varchar(128) | Contact email |
| `tax_id` | varchar(32) | Tax identifier |
| `roles` | text[] | RBAC role codes assigned to this client (default `'{}'`). References `roles.code`. |
| `is_app_user` | boolean | Default false. Must be true before a `nap_users` login can be created. Requires `roles` to be non-empty. |
| `is_active` | boolean | Default true |

**Endpoint:** `/api/core/v1/clients`

#### 3.3.3 Employees

| Field | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `tenant_id` | uuid | Not null |
| `source_id` | uuid | FK to sources (CASCADE) |
| `first_name` | varchar(64) | Not null |
| `last_name` | varchar(64) | Not null |
| `code` | varchar(16) | Unique per tenant |
| `position` | varchar(64) | Job title |
| `department` | varchar(64) | Department |
| `roles` | text[] | RBAC role codes assigned to this employee (default `'{}'`). References `roles.code`. |
| `is_app_user` | boolean | Default false. Must be true before a `nap_users` login can be created. Requires `roles` to be non-empty. |
| `is_primary_contact` | boolean | Default false. Designates this employee as the tenant's primary contact. |
| `is_billing_contact` | boolean | Default false. Designates this employee as the tenant's billing contact. |
| `is_active` | boolean | Default true |

> **Contact Designation:** Both `is_primary_contact` and `is_billing_contact` can be true on the same employee (e.g., small company owner is both primary and billing contact). These flags replace the former `nap_users.tenant_role` designation. When the primary contact leaves the tenant (deactivated), the tenant's account executive is responsible for designating a new primary contact.

**Endpoint:** `/api/core/v1/employees`

#### 3.3.4 Polymorphic Sources, Contacts, Addresses & Phone Numbers

The `sources` table implements a **discriminated union** pattern linking vendors, clients, employees, and contacts to shared addresses and phone numbers:

**Sources:**
| Field | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `tenant_id` | uuid | Not null |
| `table_id` | uuid | References the parent entity |
| `source_type` | varchar(32) | `vendor`, `client`, `employee`, `contact` |
| `label` | varchar(64) | Human-friendly label |

**Contacts (First-Class Entity — Miscellaneous Payees):**

Contacts are first-class entities representing miscellaneous payees that don't fall into vendor, client, or employee categories — e.g., one-off commission payments or charitable donations. The contacts table mirrors the clients table structure:

| Field | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `tenant_id` | uuid | Not null |
| `source_id` | uuid | FK to sources (CASCADE) |
| `name` | varchar(128) | Not null |
| `code` | varchar(16) | Unique per tenant |
| `email` | varchar(128) | Contact email |
| `tax_id` | varchar(32) | Tax identifier |
| `roles` | text[] | RBAC role codes assigned to this contact (default `'{}'`). References `roles.code`. |
| `is_app_user` | boolean | Default false. Must be true before a `nap_users` login can be created. Requires `roles` to be non-empty. |
| `is_active` | boolean | Default true |

> **Note:** Contacts use the polymorphic `sources` pattern (with `source_type = 'contact'`) for linked addresses and phone numbers, just like vendors, clients, and employees.

**Addresses:**
| Field | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `source_id` | uuid | FK to sources (CASCADE) |
| `label` | varchar(32) | `billing`, `physical`, `mailing` |
| `address_line_1` | varchar(255) | Street address or P.O. Box |
| `address_line_2` | varchar(255) | Apt, suite, unit, building, floor, etc. |
| `address_line_3` | varchar(255) | Additional line (international addresses) |
| `city` | varchar(128) | City / locality / town |
| `state_province` | varchar(128) | State, province, region, prefecture, county |
| `postal_code` | varchar(20) | ZIP / postal code (supports all global formats) |
| `country_code` | char(2) | ISO 3166-1 alpha-2 country code (e.g., `US`, `GB`, `JP`) |
| `is_primary` | boolean | Primary address flag |

**Phone Numbers:**
| Field | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `source_id` | uuid | FK to sources (CASCADE), not null |
| `phone_type` | varchar(16) | `cell`, `work`, `home`, `fax`, `other` (default `cell`) |
| `phone_number` | varchar(32) | Not null |
| `is_primary` | boolean | Default false |

> **Note:** Phone numbers are available to vendors, clients, employees, and contacts via the polymorphic `sources` pattern.

> **Global Address Best Practices:** The `addresses` table follows an internationally flexible schema:
> - Three address lines accommodate any country's format without rigid field assumptions
> - `state_province` is a generic region field (US states, UK counties, Japanese prefectures, etc.)
> - `country_code` uses ISO 3166-1 alpha-2 for reliable lookup and localization
> - `postal_code` as varchar(20) covers all known formats (US ZIP+4, UK postcodes, etc.)
> - **Mailing label generation:** Concatenate non-empty address lines, then `city + state_province + postal_code` on one line, then country name (resolved from `country_code`). Country-specific formatting rules (e.g., Japanese address order reversal) can be applied via a locale-aware formatter.

**Endpoints:** `/api/core/v1/sources`, `/api/core/v1/contacts`, `/api/core/v1/addresses`, `/api/core/v1/phone-numbers`

#### 3.3.5 Inter-Companies

| Field | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `tenant_id` | uuid | Not null |
| `code` | varchar(16) | Unique company code |
| `name` | varchar(128) | Company name |
| `tax_id` | varchar(32) | EIN/tax ID |
| `is_active` | boolean | Default true |

**Endpoint:** `/api/core/v1/inter-companies`

---

### 3.4 Project Management

**Purpose:** Manage construction projects, units (deliverables), tasks, cost items, and change orders. Supports template-based project creation.

#### 3.4.1 Projects

**Data Model:**

| Field | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `tenant_id` | uuid | Not null |
| `company_id` | uuid | FK to inter_companies (RESTRICT) |
| `address_id` | uuid | FK to addresses (SET NULL) |
| `project_code` | varchar(32) | Unique per tenant |
| `name` | varchar(255) | Project name |
| `description` | text | Description |
| `notes` | text | Internal notes |
| `status` | varchar(20) | `planning` -> `budgeting` -> `released` -> `complete` |
| `contract_amount` | numeric(14,2) | Total contract value from client (for profitability) |

**Endpoints:** `/api/projects/v1/projects` and `/api/activities/v1/projects`

**Project Clients (Junction Table):**

Associates multiple clients with a project contract. Replaces the former single `client_id` FK on projects.

| Field | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `project_id` | uuid | FK to projects (CASCADE) |
| `client_id` | uuid | FK to clients (RESTRICT) |
| `role` | varchar(32) | e.g., `buyer`, `co-buyer`, `guarantor` |
| `is_primary` | boolean | Primary client on the contract |

Unique constraint: `(project_id, client_id)`

**Endpoint:** `/api/projects/v1/project-clients`

#### 3.4.2 Units

| Field | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `project_id` | uuid | FK to projects (CASCADE) |
| `template_unit_id` | uuid | FK to template_units (SET NULL) |
| `version_used` | integer | Template version used |
| `name` | varchar(128) | Unit name |
| `unit_code` | varchar(32) | Unique per project |
| `status` | varchar(20) | `draft` -> `in_progress` -> `complete` |

**Endpoint:** `/api/projects/v1/units`

#### 3.4.3 Tasks & Task Groups

**Task Groups:**
| Field | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `code` | varchar(16) | Unique code |
| `name` | varchar(64) | Group name |
| `description` | text | Description |
| `sort_order` | integer | Display order |

**Tasks Master (Library):**
| Field | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `code` | varchar(16) | Unique task code |
| `task_group_code` | varchar(16) | FK to task_groups (RESTRICT) |
| `name` | varchar(128) | Task name |
| `default_duration_days` | integer | Default duration |

**Tasks (Unit-level instances):**
| Field | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `unit_id` | uuid | FK to units (CASCADE) |
| `task_code` | varchar(16) | Reference to master task |
| `name` | varchar(128) | Task name |
| `duration_days` | integer | Duration |
| `status` | varchar(20) | `pending` -> `in_progress` -> `complete` |
| `parent_task_id` | uuid | Self-referential for hierarchy |

**Endpoints:** `/api/projects/v1/tasks`, `/api/projects/v1/task-groups`, `/api/projects/v1/tasks-master`

#### 3.4.4 Cost Items

| Field | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `task_id` | uuid | FK to tasks (CASCADE) |
| `item_code` | varchar(16) | Cost item code |
| `description` | varchar(255) | Description |
| `cost_class` | varchar(16) | `labor`, `material`, `subcontract`, `equipment`, `other` |
| `cost_source` | varchar(16) | `budget`, `change_order` |
| `quantity` | numeric(12,4) | Quantity |
| `unit_cost` | numeric(12,4) | Unit cost |
| `amount` | numeric(12,2) | **GENERATED** (quantity * unit_cost) |

**Endpoint:** `/api/projects/v1/cost-items`

#### 3.4.5 Change Orders

| Field | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `unit_id` | uuid | FK to units (CASCADE) |
| `co_number` | varchar(16) | Change order number |
| `title` | varchar(128) | Title |
| `reason` | text | Justification |
| `status` | varchar(20) | `draft` -> `submitted` -> `approved` / `rejected` |
| `total_amount` | numeric(12,2) | Total change amount |

**Business Rules:**
- Change order lines reference base `cost_line_id` when modifying existing scope
- Approved change orders adjust remaining budget and variance metrics
- Negative quantities/costs represent scope reductions
- Posting fires GL hooks with explicit references

**Endpoint:** `/api/projects/v1/change-orders`

#### 3.4.6 Templates

Templates serve as reusable blueprints for project creation:

- **Template Units**: Blueprint for units with `name`, `version`, `status` (draft/active/archived)
- **Template Tasks**: Blueprint tasks with `task_code`, `name`, `duration_days`, `parent_code` hierarchy
- **Template Cost Items**: Blueprint cost items with cost class, source, quantity, unit cost, and generated amount
- **Template Change Orders**: Blueprint change orders

**Endpoints:** `/api/projects/v1/template-units`, `/api/projects/v1/template-tasks`, `/api/projects/v1/template-cost-items`, `/api/projects/v1/template-change-orders`

---

### 3.5 Activities & Cost Management

**Purpose:** Categorical cost tracking with deliverables, budgets, cost lines, actual costs, and change orders.

#### 3.5.1 Categories & Activities

**Categories:**
| Field | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `code` | varchar(16) | Unique code |
| `name` | varchar(64) | Category name (e.g., "Framing", "Plumbing") |
| `type` | varchar(16) | `labor`, `material`, `subcontract`, `equipment`, `other` |

**Activities:**
| Field | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `category_id` | uuid | FK to categories (CASCADE) |
| `code` | varchar(16) | Unique activity code |
| `name` | varchar(64) | Activity name |
| `is_active` | boolean | Default true |

**Endpoints:** `/api/activities/v1/categories`, `/api/activities/v1/activities`

#### 3.5.2 Deliverables & Assignments

**Deliverables:**
| Field | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `name` | varchar(128) | Deliverable name |
| `description` | text | Description |
| `status` | varchar(20) | `pending` -> `released` -> `finished` -> `canceled` |
| `start_date`, `end_date` | date | Timeline |

**Deliverable Assignments:**
| Field | Type | Description |
|---|---|---|
| `deliverable_id` | uuid | FK to deliverables (CASCADE) |
| `project_id` | uuid | FK to projects (CASCADE) |
| `employee_id` | uuid | FK (optional) |
| `notes` | text | Assignment notes |

**Endpoints:** `/api/activities/v1/deliverables`, `/api/activities/v1/deliverable-assignments`

#### 3.5.3 Budgets

| Field | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `deliverable_id` | uuid | FK to deliverables (CASCADE) |
| `activity_id` | uuid | FK to activities (CASCADE) |
| `budgeted_amount` | numeric | Amount |
| `version` | integer | Version number (must be > 0) |
| `is_current` | boolean | Default true |
| `status` | varchar(20) | `draft` -> `submitted` -> `approved` -> `locked` -> `rejected` |
| `submitted_by/at` | varchar/timestamptz | Submission audit |
| `approved_by/at` | varchar/timestamptz | Approval audit |

**Business Rules:**
- Budgets must be approved before units can be marked `released`
- Approved versions become read-only; new changes spawn another version
- `remaining_budget` and `spent_to_date` updated by triggers/services

**Endpoint:** `/api/activities/v1/budgets`

#### 3.5.4 Cost Lines

| Field | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `company_id` | uuid | FK to inter_companies (RESTRICT) |
| `deliverable_id` | uuid | FK to deliverables (CASCADE) |
| `vendor_id` | uuid | FK to vendors |
| `activity_id` | uuid | FK to activities (CASCADE) |
| `budget_id` | uuid | FK to budgets (SET NULL) |
| `tenant_sku` | varchar(64) | SKU reference |
| `source_type` | varchar(16) | `material` or `labor` |
| `quantity` | numeric(12,4) | Quantity |
| `unit_price` | numeric(12,4) | Unit price |
| `amount` | numeric(12,2) | **GENERATED** (quantity * unit_price) |
| `markup_pct` | numeric(5,2) | Markup percentage |
| `status` | varchar(20) | `draft` -> `locked` -> `change_order` |

**Endpoint:** `/api/activities/v1/cost-lines`

#### 3.5.5 Actual Costs

| Field | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `activity_id` | uuid | FK to activities (CASCADE) |
| `project_id` | uuid | FK to projects (SET NULL) — links cost to project for profitability |
| `amount` | numeric(12,2) | Cost amount |
| `currency` | varchar(3) | Currency code |
| `reference` | text | Invoice/source reference |
| `approval_status` | varchar(20) | `pending` -> `approved` -> `rejected` |
| `incurred_on` | date | Date cost was incurred |

**Business Rules:**
- Default state: `pending`; approval subject to budget/tolerance checks
- Validation: unit must be `released`, cost line must exist and be approved
- Amounts cannot exceed approved budget + tolerance unless covered by change orders
- Approval triggers GL posting (debit expense/WIP, credit AP/accrual)

**Endpoint:** `/api/activities/v1/actual-costs`

#### 3.5.6 Vendor Parts

| Field | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `vendor_id` | uuid | FK to vendors (CASCADE) |
| `vendor_sku` | varchar(64) | Vendor's SKU |
| `tenant_sku` | varchar(64) | Internal tenant SKU |
| `unit_cost` | numeric(12,4) | Unit cost |
| `currency` | varchar(3) | Currency code |
| `markup_pct` | numeric(5,2) | Markup percentage |
| `is_active` | boolean | Default true |

**Endpoint:** `/api/activities/v1/vendor-parts`

---

### 3.6 Bill of Materials (BOM)

**Purpose:** Manage material catalogs, vendor SKU matching (with AI-powered similarity search), and vendor pricing.

#### 3.6.1 Catalog SKUs

| Field | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `catalog_sku` | varchar(64) | Unique catalog SKU |
| `description` | text | Full description |
| `description_normalized` | text | Normalized for matching |
| `category` | varchar(64) | Material category |
| `sub_category` | varchar(64) | Sub-category |
| `model` | varchar(32) | Embedding model used |
| `embedding` | vector(3072) | pgvector embedding for similarity search |

**Endpoint:** `/api/bom/v1/catalog-skus`

#### 3.6.2 Vendor SKUs

| Field | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `vendor_id` | uuid | FK to vendors (RESTRICT) |
| `vendor_sku` | varchar(64) | Vendor's SKU code |
| `description` | text | Vendor's description |
| `description_normalized` | text | Normalized description |
| `catalog_sku_id` | uuid | FK to catalog_skus (matched, SET NULL) |
| `confidence` | float | Match confidence score (0.0-1.0) |
| `model` | varchar(32) | Embedding model (default: text-embedding-3-large) |
| `embedding` | vector(3072) | pgvector embedding |

**Custom Methods:**
- `findBySku(vendor_id, vendor_sku)`: Lookup by composite key
- `getUnmatched()`: Get vendor SKUs without catalog matches
- `refreshEmbeddings(vendorSkuBatches)`: Batch update embeddings

**Endpoint:** `/api/bom/v1/vendor-skus`

#### 3.6.3 Vendor Pricing

| Field | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `vendor_sku_id` | uuid | FK to vendor_skus (CASCADE) |
| `unit_price` | numeric | Price per unit |
| `unit` | varchar(32) | Unit of measure |
| `effective_date` | date | Price effective date |

**Endpoint:** `/api/bom/v1/vendor-pricing`

---

### 3.7 Accounts Payable (AP)

**Purpose:** Manage vendor invoices, invoice lines, payments, and credit memos.

#### 3.7.1 AP Invoices

| Field | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `company_id` | uuid | FK to inter_companies (RESTRICT) |
| `vendor_id` | uuid | FK to vendors (RESTRICT) |
| `project_id` | uuid | FK to projects (SET NULL) — required for project cashflow tracking |
| `invoice_number` | varchar(32) | Invoice number |
| `invoice_date` | date | Invoice date |
| `due_date` | date | Payment due date |
| `total_amount` | numeric(12,2) | Total amount |
| `status` | varchar(16) | `open` -> `approved` -> `paid` -> `voided` |

**Business Rules:**
- Posting requires every line to map to a valid GL account and optionally a cost line
- Posting updates vendor balances and creates GL entries (AP Liability <-> Expense/WIP)
- When `project_id` is set, the invoice amount feeds into project cashflow outflow metrics

**Endpoint:** `/api/ap/v1/ap-invoices`

#### 3.7.2 AP Invoice Lines

| Field | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `invoice_id` | uuid | FK to ap_invoices (CASCADE) |
| `cost_line_id` | uuid | FK to cost_lines (SET NULL) |
| `activity_id` | uuid | FK to activities (SET NULL) |
| `account_id` | uuid | FK to chart_of_accounts (RESTRICT) |
| `description` | text | Line description |
| `amount` | numeric(12,2) | Line amount |

**Endpoint:** `/api/ap/v1/ap-invoice-lines`

#### 3.7.3 Payments

| Field | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `vendor_id` | uuid | FK to vendors (RESTRICT) |
| `ap_invoice_id` | uuid | FK to ap_invoices (SET NULL) |
| `payment_date` | date | Payment date |
| `amount` | numeric(12,2) | Payment amount |
| `method` | varchar(24) | `check`, `ach`, `wire` |
| `reference` | varchar(64) | Check number/reference |

**Endpoint:** `/api/ap/v1/payments`

#### 3.7.4 AP Credit Memos

| Field | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `vendor_id` | uuid | FK to vendors (RESTRICT) |
| `ap_invoice_id` | uuid | FK to ap_invoices (SET NULL) |
| `credit_number` | varchar(32) | Credit memo number |
| `credit_date` | date | Credit date |
| `amount` | numeric(12,2) | Credit amount |
| `status` | varchar(16) | `open` -> `applied` -> `voided` |

**Endpoint:** `/api/ap/v1/ap-credit-memos`

---

### 3.8 Accounts Receivable (AR)

**Purpose:** Manage client invoices, invoice lines, and payment receipts. AR is the primary revenue source for project profitability tracking.

> **Note:** The `ar_clients` table has been removed. The unified `clients` table (§3.3.2) with `email` and `tax_id` fields replaces it. Client addresses and phone numbers are available via the polymorphic `sources` pattern. AR invoices reference `clients.id` directly.

#### 3.8.1 AR Invoices

| Field | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `company_id` | uuid | FK to inter_companies (RESTRICT) |
| `client_id` | uuid | FK to clients (RESTRICT) |
| `project_id` | uuid | FK to projects (SET NULL) — required for project revenue tracking |
| `deliverable_id` | uuid | FK to deliverables (SET NULL) |
| `invoice_number` | varchar(32) | Invoice number |
| `invoice_date` | date | Invoice date |
| `due_date` | date | Due date |
| `total_amount` | numeric(12,2) | Total amount |
| `status` | varchar(16) | `open` -> `sent` -> `paid` -> `voided` |

**Business Rules:**
- Revenue recognition can depend on activity completion percentage or cost thresholds
- Posting debits AR, credits revenue; payments reverse the entry
- When `project_id` is set, the invoice feeds into project revenue/cashflow inflow metrics
- Partial payments and retainage supported (see Cashflow module)

**Endpoint:** `/api/ar/v1/ar-invoices`

#### 3.8.2 AR Invoice Lines

| Field | Type | Description |
|---|---|---|
| `invoice_id` | uuid | FK to ar_invoices (CASCADE) |
| `account_id` | uuid | FK to chart_of_accounts (RESTRICT) |
| `description` | text | Line description |
| `amount` | numeric(12,2) | Line amount |

**Endpoint:** `/api/ar/v1/ar-invoice-lines`

#### 3.8.3 Receipts

| Field | Type | Description |
|---|---|---|
| `client_id` | uuid | FK to clients (RESTRICT) |
| `ar_invoice_id` | uuid | FK to ar_invoices (SET NULL) |
| `receipt_date` | date | Receipt date |
| `amount` | numeric(12,2) | Receipt amount |
| `method` | varchar(24) | `check`, `ach`, `wire` |
| `reference` | varchar(64) | Reference number |

**Endpoint:** `/api/ar/v1/receipts`

---

### 3.9 Accounting & General Ledger

**Purpose:** Chart of accounts, journal entries, ledger balances, posting queues, and category-account mappings.

#### 3.9.1 Chart of Accounts

| Field | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `code` | varchar(16) | Account code |
| `name` | varchar(64) | Account name |
| `type` | varchar(16) | `asset`, `liability`, `equity`, `income`, `expense`, `cash`, `bank` |
| `is_active` | boolean | Default true |
| `cash_basis` | boolean | Default false |
| `bank_account_number` | varchar(32) | For cash/bank types |
| `routing_number` | varchar(16) | Bank routing |
| `bank_name` | varchar(64) | Bank name |

**Endpoint:** `/api/accounting/v1/chart-of-accounts`

#### 3.9.2 Journal Entries

| Field | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `company_id` | uuid | FK to inter_companies (RESTRICT) |
| `project_id` | uuid | FK to projects (SET NULL) — enables project-level GL analysis |
| `entry_date` | date | Entry date |
| `description` | text | Description |
| `status` | varchar(16) | `pending` -> `posted` -> `reversed` |
| `source_type` | varchar(32) | `activity_actual`, `invoice`, `payment`, etc. |
| `source_id` | uuid | Reference to source record |
| `corrects_id` | uuid | Self-ref FK for reversals (SET NULL) |

**Business Rules:**
- Entries must balance (sum debits = sum credits)
- Entries must fall within open fiscal periods
- Self-referential `corrects_id` supports reversal chains

**Endpoint:** `/api/accounting/v1/journal-entries`

#### 3.9.3 Journal Entry Lines

| Field | Type | Description |
|---|---|---|
| `entry_id` | uuid | FK to journal_entries (CASCADE) |
| `account_id` | uuid | FK to chart_of_accounts (RESTRICT) |
| `debit` | numeric(12,2) | Debit amount (default 0) |
| `credit` | numeric(12,2) | Credit amount (default 0) |
| `memo` | text | Line memo |
| `related_table` | varchar(32) | Polymorphic reference table |
| `related_id` | uuid | Polymorphic reference ID |

**Endpoint:** `/api/accounting/v1/journal-entry-lines`

#### 3.9.4 Ledger Balances

| Field | Type | Description |
|---|---|---|
| `account_id` | uuid | FK to chart_of_accounts (RESTRICT) |
| `as_of_date` | date | Balance date |
| `balance` | numeric(14,2) | Account balance |

**Endpoint:** `/api/accounting/v1/ledger-balances`

#### 3.9.5 Posting Queues

| Field | Type | Description |
|---|---|---|
| `journal_entry_id` | uuid | FK to journal_entries (CASCADE) |
| `status` | varchar(16) | `pending` -> `posted` -> `failed` |
| `error_message` | text | Error details on failure |
| `processed_at` | timestamp | Processing timestamp |

**Endpoint:** `/api/accounting/v1/posting-queues`

#### 3.9.6 Category-Account Map

Maps cost categories to GL accounts with date-range validity:

| Field | Type | Description |
|---|---|---|
| `category_id` | uuid | FK to categories (RESTRICT) |
| `account_id` | uuid | FK to chart_of_accounts (RESTRICT) |
| `valid_from` | date | Effective start date |
| `valid_to` | date | Effective end date |

**Endpoint:** `/api/accounting/v1/categories-account-map`

#### 3.9.7 Intercompany Accounting

**Inter-Company Accounts:**
| Field | Type | Description |
|---|---|---|
| `source_company_id` | uuid | FK to inter_companies (RESTRICT) |
| `target_company_id` | uuid | FK to inter_companies (RESTRICT) |
| `inter_company_account_id` | uuid | FK to chart_of_accounts (RESTRICT) |
| `is_active` | boolean | Default true |

Unique constraint: `(tenant_id, source_company_id, target_company_id)`

**Inter-Company Transactions:**
| Field | Type | Description |
|---|---|---|
| `source_company_id` | uuid | FK to inter_companies (RESTRICT) |
| `target_company_id` | uuid | FK to inter_companies (RESTRICT) |
| `source_journal_entry_id` | uuid | FK to journal_entries (SET NULL) |
| `target_journal_entry_id` | uuid | FK to journal_entries (SET NULL) |
| `module` | varchar(32) | `ar`, `ap`, `je` |
| `status` | varchar(16) | Default `pending` |

**Internal Transfers:**
| Field | Type | Description |
|---|---|---|
| `from_account_id` | uuid | FK to chart_of_accounts (RESTRICT) |
| `to_account_id` | uuid | FK to chart_of_accounts (RESTRICT) |
| `transfer_date` | date | Transfer date |
| `amount` | numeric(12,2) | Transfer amount |

**Business Rules:**
- Intercompany transactions create paired journal entries (due-to / due-from)
- Carry elimination flags for consolidated reporting
- Consolidation targets tenant-level P&L, balance sheet, and elimination reports

**Endpoints:** `/api/accounting/v1/inter-company-accounts`, `/api/accounting/v1/inter-company-transactions`, `/api/accounting/v1/internal-transfers`

---

### 3.10 Cashflow & Profitability

**Purpose:** Track money flowing in (AR receipts) and money flowing out (AP payments, actual costs) at the project level. Provide real-time profitability analysis, margin tracking, and cashflow forecasting to enable project managers and CFOs to make informed financial decisions.

#### 3.10.1 Data Linkage Model

Cashflow and profitability are derived from existing transactional data — no separate cashflow tables are needed. The system relies on `project_id` foreign keys present on AR invoices, AP invoices, actual costs, and journal entries.

```
PROJECT PROFITABILITY = Revenue (AR) − Costs (AP + Actual Costs)

Revenue Sources (Inflows):
  ├── ar_invoices WHERE project_id = ? AND status IN ('sent','paid')
  ├── receipts   JOIN ar_invoices WHERE project_id = ?
  └── journal_entry_lines WHERE account.type = 'income' AND entry.project_id = ?

Cost Sources (Outflows):
  ├── ap_invoices     WHERE project_id = ? AND status IN ('approved','paid')
  ├── payments        JOIN ap_invoices WHERE project_id = ?
  ├── actual_costs    WHERE project_id = ? AND approval_status = 'approved'
  └── journal_entry_lines WHERE account.type = 'expense' AND entry.project_id = ?
```

#### 3.10.2 Project Profitability Metrics

| Metric | Calculation | Description |
|---|---|---|
| **Contract Value** | `projects.contract_amount` | Total client contract value |
| **Invoiced Revenue** | SUM `ar_invoices.total_amount` WHERE project_id AND status != 'voided' | Total billed to client |
| **Collected Revenue** | SUM `receipts.amount` JOIN ar_invoices WHERE project_id | Cash actually received |
| **Outstanding AR** | Invoiced Revenue − Collected Revenue | Unpaid client invoices |
| **Total Budgeted Cost** | SUM `cost_items.amount` + approved change orders | Approved budget for project |
| **Committed Cost** | SUM `ap_invoices.total_amount` WHERE project_id AND status != 'voided' | Vendor invoices posted |
| **Actual Spend** | SUM `actual_costs.amount` WHERE project_id AND approved | Confirmed expenditures |
| **Cash Out** | SUM `payments.amount` JOIN ap_invoices WHERE project_id | Cash actually paid to vendors |
| **Gross Profit** | Invoiced Revenue − Committed Cost | Revenue minus committed costs |
| **Gross Margin %** | (Gross Profit / Invoiced Revenue) × 100 | Profitability percentage |
| **Net Cashflow** | Collected Revenue − Cash Out | Real cash position |
| **Budget Variance** | Total Budgeted Cost − Actual Spend | Over/under budget |
| **Estimated Cost at Completion** | Actual Spend + Remaining Budget (uncommitted) | Projected total cost |
| **Projected Profit** | Contract Value − Estimated Cost at Completion | Forecasted final profit |
| **Projected Margin %** | (Projected Profit / Contract Value) × 100 | Forecasted final margin |

#### 3.10.3 Cashflow Timeline

Track periodic inflows/outflows to understand cash timing:

**Cashflow Summary (computed, not stored):**
| Dimension | Inflow Source | Outflow Source |
|---|---|---|
| **By Month** | `receipts.receipt_date` | `payments.payment_date` |
| **By Quarter** | Aggregated monthly | Aggregated monthly |
| **By Project Phase** | AR invoices per deliverable | AP invoices + actuals per deliverable |
| **By Vendor** | N/A | `payments` grouped by `vendor_id` |
| **By Client** | `receipts` grouped by `client_id` | N/A |

**Forecast Inputs:**
| Data Point | Source |
|---|---|
| Expected AR inflows | `ar_invoices.due_date` WHERE status = 'sent' (unpaid) |
| Expected AP outflows | `ap_invoices.due_date` WHERE status = 'approved' (unpaid) |
| Budget burn rate | `actual_costs` trend over rolling 30/60/90-day windows |

#### 3.10.4 SQL Views for Profitability

These views are created in each tenant schema at provisioning time and updated via migrations:

**`vw_project_profitability`:**
```sql
-- Rolled-up profitability metrics per project
-- Joins: projects, ar_invoices, receipts, ap_invoices, payments, actual_costs, cost_items
-- Columns: project_id, project_code, project_name, contract_amount,
--          invoiced_revenue, collected_revenue, outstanding_ar,
--          total_budgeted_cost, committed_cost, actual_spend, cash_out,
--          gross_profit, gross_margin_pct, net_cashflow,
--          budget_variance, est_cost_at_completion, projected_profit, projected_margin_pct
```

**`vw_project_cashflow_monthly`:**
```sql
-- Monthly inflow/outflow time series per project
-- Columns: project_id, month, inflow (receipts), outflow (payments + actuals),
--          net_cashflow, cumulative_inflow, cumulative_outflow, cumulative_net
```

**`vw_project_cost_by_category`:**
```sql
-- Cost breakdown by activity category per project
-- Joins: actual_costs, activities, categories, cost_lines
-- Columns: project_id, category_code, category_name, category_type,
--          budgeted_amount, committed_amount, actual_amount, variance
```

**`vw_ar_aging`:**
```sql
-- AR aging buckets per client and project
-- Columns: client_id, project_id, current, days_30, days_60, days_90, days_90_plus, total_outstanding
```

**`vw_ap_aging`:**
```sql
-- AP aging buckets per vendor and project
-- Columns: vendor_id, project_id, current, days_30, days_60, days_90, days_90_plus, total_outstanding
```

#### 3.10.5 API Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/reports/v1/project-profitability` | List profitability for all active projects |
| `GET` | `/api/reports/v1/project-profitability/:projectId` | Detailed profitability for single project |
| `GET` | `/api/reports/v1/project-cashflow/:projectId` | Monthly cashflow time series for project |
| `GET` | `/api/reports/v1/project-cashflow/:projectId/forecast` | Projected cashflow based on AR due dates and AP obligations |
| `GET` | `/api/reports/v1/project-cost-breakdown/:projectId` | Cost by category with budget vs actual |
| `GET` | `/api/reports/v1/ar-aging` | AR aging report across all clients |
| `GET` | `/api/reports/v1/ar-aging/:clientId` | AR aging for specific client |
| `GET` | `/api/reports/v1/ap-aging` | AP aging report across all vendors |
| `GET` | `/api/reports/v1/ap-aging/:vendorId` | AP aging for specific vendor |
| `GET` | `/api/reports/v1/company-cashflow` | Aggregated cashflow across all projects for a company |
| `GET` | `/api/reports/v1/margin-analysis` | Cross-project margin comparison and trending |

#### 3.10.6 UI Requirements

**Project Profitability Dashboard:**
- Summary cards: Contract Value, Invoiced Revenue, Gross Profit, Gross Margin %, Net Cashflow
- Status indicators: green (on budget), yellow (approaching budget), red (over budget)
- Drill-down from project list to individual project detail
- MUI X Charts: bar chart comparing budget vs committed vs actual per category

**Cashflow Timeline Chart:**
- MUI X Charts: stacked area chart showing monthly inflows vs outflows
- Cumulative net cashflow trend line
- Forecast region (dashed lines) for upcoming AR/AP due dates
- Toggle: actual vs forecast vs combined view

**Profitability Table:**
- MUI X Data Grid with all metrics from §3.10.2
- Sortable by any metric column
- Conditional formatting: red for negative margins, green for healthy margins
- Export to Excel via `exportToSpreadsheet()`

**AR/AP Aging Grids:**
- Aging bucket columns: Current, 31-60, 61-90, 90+
- Grouped by client (AR) or vendor (AP)
- Filterable by project
- Summary row with totals

---

### 3.11 Reporting & Views

**Purpose:** Pre-computed SQL views for dashboards and data export.

**Core Export Views:**
| View | Description |
|---|---|
| `vw_export_contacts` | Unified contacts across vendors, clients, employees with source_type |
| `vw_export_addresses` | Unified addresses across all source types |
| `vw_export_template_cost_items` | Template cost items with unit name, version, task hierarchy |
| `vw_template_tasks_export` | Template tasks with unit name and version |

**Export View Endpoints (`/api/views/v1/`):**
| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/views/v1/contacts` | Query `vw_export_contacts` for current tenant |
| `GET` | `/api/views/v1/addresses` | Query `vw_export_addresses` for current tenant |
| `GET` | `/api/views/v1/template-cost-items` | Query `vw_export_template_cost_items` for current tenant |
| `GET` | `/api/views/v1/template-tasks` | Query `vw_template_tasks_export` for current tenant |

**Financial Views (see §3.10.4):**
| View | Description |
|---|---|
| `vw_project_profitability` | Rolled-up profitability metrics per project |
| `vw_project_cashflow_monthly` | Monthly inflow/outflow time series |
| `vw_project_cost_by_category` | Cost breakdown by activity category |
| `vw_ar_aging` | AR aging buckets by client/project |
| `vw_ap_aging` | AP aging buckets by vendor/project |

**Budget vs Actual Metrics:**
| Metric | Calculation |
|---|---|
| Original Budget | Sum of approved `cost_lines.total_cost` |
| Change Orders | Sum of approved `change_order_lines.total_cost` |
| Actual Costs | Sum of `actual_costs.amount` (approved) |
| Total Exposure | Original Budget + Change Orders |
| Variance (Baseline) | Original Budget − Actual Costs |
| Variance (Total) | Total Exposure − Actual Costs |

---

### 3.12 Match Review Logs

**Purpose:** Audit trail for BOM vendor SKU matching decisions.

| Field | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `entity_type` | varchar(32) | Entity being matched |
| `entity_id` | uuid | Entity ID |
| `match_type` | varchar(32) | Type of match |
| `match_id` | uuid | Matched entity ID |
| `reviewer_id` | uuid | Reviewer user ID |
| `decision` | varchar(16) | `accept`, `reject`, `defer` |
| `notes` | text | Reviewer notes |

**Endpoint:** `/api/tenants/v1/match-review-logs`

---

## 4. Standard API Patterns

All API routes are built from scratch using pg-schemata's TableModel and QueryModel as the data layer.

### 4.1 CRUD Operations

Every resource entity uses `createRouter` to generate a consistent REST API backed by pg-schemata:

| Method | Path | Operation | Auth | pg-schemata Method |
|---|---|---|---|---|
| `POST /` | Create single record | `full` | `model.insert(dto)` |
| `GET /` | List with cursor-based pagination | `view` | `model.findAfterCursor()` |
| `GET /where` | Query with JSON conditions | `view` | `model.findWhere()` |
| `GET /archived` | Query archived records | `view` | `model.findSoftDeleted()` |
| `GET /ping` | Health check | none | — |
| `GET /:id` | Get by ID | `view` | `model.findById()` |
| `POST /bulk-insert` | Batch create | `full` | `model.bulkInsert()` |
| `POST /import-xls` | Import from Excel | `full` | `model.importFromSpreadsheet()` |
| `POST /export-xls` | Export to Excel | `view` | `model.exportToSpreadsheet()` |
| `PUT /bulk-update` | Batch update | `full` | `model.bulkUpdate()` |
| `PUT /update` | Update by query-param filters | `full` | `model.updateWhere()` |
| `DELETE /archive` | Soft-delete | `full` | `model.removeWhere()` |
| `PATCH /restore` | Restore soft-deleted record | `full` | `model.restoreWhere()` |

### 4.2 Pagination

Keyset-based pagination via pg-schemata's `findAfterCursor()`:
- `cursor`: Last seen ID/sort value for next page
- `limit`: Page size
- `orderBy`: Sort column(s)
- `columnWhitelist`: Restrict returned columns
- `includeDeactivated`: Include soft-deleted records

### 4.3 Audit Fields

All models define `hasAuditFields: { enabled: true, userFields: { type: 'uuid' } }`. pg-schemata automatically:
- Sets `created_at` and `created_by` on insert
- Sets `updated_at` and `updated_by` on update
- Resolves the current user via `setAuditActorResolver()` (integrated with AsyncLocalStorage per-request context)

### 4.4 Soft Deletes

All models define `softDelete: true`. pg-schemata automatically:
- Excludes records where `deactivated_at IS NOT NULL` from all read queries
- `removeWhere()` sets `deactivated_at = NOW()`
- `restoreWhere()` clears `deactivated_at`
- `findSoftDeleted()` returns only deactivated records
- `purgeSoftDeleteWhere()` available for permanent removal if needed

### 4.5 Validation

pg-schemata auto-generates Zod validators from schema definitions:
- Insert validation: enforces `notNull` columns, type coercion, immutable fields
- Update validation: excludes `immutable` columns, partial validation
- Custom validators can be attached per-column via `colProps.validator`

### 4.6 Excel Import/Export

Built into pg-schemata's TableModel:
- **Import**: `importFromSpreadsheet(filePath, sheetIndex, callbackFn?)` — parses XLSX, validates against schema, bulk inserts with audit fields
- **Export**: `exportToSpreadsheet(filePath, where?, joinType?, options?)` — queries with filtering, streams to XLSX

---

## 5. Database Design

### 5.1 Common Columns

Every business table includes (managed by pg-schemata schema definitions):
- `id`: UUID primary key (default `gen_random_uuid()`, `immutable: true`)
- `tenant_id` / `tenant_code`: Tenant isolation
- `created_at`, `updated_at`: Timestamps (via `hasAuditFields`)
- `created_by`, `updated_by`: User UUID references (via `hasAuditFields`)
- `deactivated_at`: Soft delete marker (via `softDelete: true`)

### 5.2 Naming Conventions

- Tables: plural `snake_case` (e.g., `vendor_skus`)
- Columns: `snake_case`
- Foreign keys: must specify `onDelete` behavior in schema definition
- All FK columns are indexed via schema `constraints.indexes`

### 5.3 Generated Columns

Defined in pg-schemata schemas with `generated: 'always'`, `stored: true`:
- `template_cost_items.amount = quantity * unit_cost`
- `cost_lines.amount = quantity * unit_price`
- `cost_items.amount = quantity * unit_cost`

### 5.4 Schema Management & Migrations

**Table Creation via pg-schemata:**
- Each model's schema definition is the source of truth for DDL
- `bootstrap({ models, schema, extensions, db })` creates all tables in topological FK order within a single transaction
- New tenant provisioning: `bootstrap()` with the tenant's schema name creates the full table set

**Migrations via pg-schemata MigrationManager:**
- `MigrationManager({ schema, dir })` discovers and applies migrations from directory
- SHA-256 checksums prevent re-applying modified migrations
- PostgreSQL advisory locks prevent concurrent migration runs
- `schema_migrations` table tracks applied versions per schema
- Separate migration directories for admin vs tenant schemas

**Migration Order:**
1. `202502110001` — Bootstrap admin (tenants, nap_users, match_review_logs). Note: `nap_users` uses polymorphic `entity_type`/`entity_id` instead of `employee_id`; `nap_user_phones` and `nap_user_addresses` removed.
2. `202502110010` — Core RBAC tables (roles, policies). Note: `role_members` has been removed — role assignment is stored as a `roles` text array on entity tables.
3. `202502110011` — Core entity tables (sources, vendors, clients, employees, contacts, addresses, phone_numbers, inter_companies). Note: all four entity tables include `roles` (text[]) and `is_app_user`; `contacts` is a first-class entity (miscellaneous payees); `sources` CHECK includes `'contact'`; `clients` includes `email` and `tax_id`; `employees` includes `is_primary_contact`, `is_billing_contact`.
4. `202502110020` — Project tables (projects, project_clients, units, tasks, cost items, change orders, templates). Note: `projects.client_id` removed; replaced by `project_clients` junction table.
5. `202502110030` — BOM tables (catalog_skus, vendor_skus, vendor_pricing) with pgvector
6. `202502110040` — Activity tables (categories, activities, deliverables, budgets, cost_lines, actual_costs, vendor_parts)
7. `202502110050` — AP tables (ap_invoices, ap_invoice_lines, payments, ap_credit_memos)
8. `202502110060` — AR tables (ar_invoices, ar_invoice_lines, receipts). Note: `ar_clients` removed — AR invoices reference the unified `clients` table directly.
9. `202502110070` — Accounting tables (chart_of_accounts, journal_entries, journal_entry_lines, ledger_balances, posting_queues, category_account_map, intercompany)
10. `202502120080` — SQL views (export views, profitability views, cashflow views, aging views)

---

## 6. UI Components & Theming

### 6.1 Theme System

Dual-mode theming with automatic OS preference detection:

**Light Mode:**
- Primary: `#003e6b` (dark navy)
- Secondary: `#f79c3c` (orange)
- Background: `#f5f5f5` / paper `#ffffff`

**Dark Mode (GitHub-Dark inspired):**
- Primary: `#f6b21b` (gold/amber)
- Secondary: `#0ea5e9` (sky blue)
- Background: `#080B10` / paper `#161B22`

Custom background tokens: `sidebar`, `header`, `surface` for layout zones.

#### 6.1.1 Component Override Strategy

Styling decisions follow a three-tier hierarchy:

1. **Theme overrides** (`theme.js` → `components`): Repeatable visual defaults that apply globally — border radius, elevation, font sizes, colour, border treatments. These eliminate the need for identical `sx` props across multiple component instances.
2. **Layout tokens** (`layoutTokens.js`): Structural dimensions (widths, heights, positions) and composite `sx` presets for layout chrome. Tokens hold **no visual styling** — only geometry, spacing, and `position`/`z-index` that vary by layout context.
3. **Inline `sx`**: Dynamic, conditional, or one-off values — active-state highlighting, per-instance spacing overrides, responsive breakpoints. Used only when the value cannot be determined at theme-build time.

**Decision tree — where does a style belong?**

| Question | Yes → | No → |
|---|---|---|
| Is it used on 3 + instances of the same MUI component? | Theme override | ↓ |
| Is it a structural dimension or position for layout chrome? | Layout token | ↓ |
| Is it dynamic (depends on props, state, or route)? | Inline `sx` | Theme override |

#### 6.1.2 Design Tokens (`layoutTokens.js`)

Structural constants consumed by layout components:

| Token | Value | Used By |
|---|---|---|
| `SIDEBAR_WIDTH_EXPANDED` | `242` | Sidebar, LayoutShell |
| `SIDEBAR_WIDTH_COLLAPSED` | `110` | Sidebar, LayoutShell |
| `TENANT_BAR_HEIGHT` | `48` | TenantBar, ModuleBar (sticky offset), theme (Toolbar dense) |
| `MODULE_BAR_HEIGHT` | `42` | ModuleBar |
| `SIDEBAR_TRANSITION` | `'width 0.2s ease'` | Sidebar Drawer paper |
| `BORDER` / `borderBottom` / `borderRight` | Divider border shorthands | ModuleBar, general usage |
| `FONT.navGroup` | `{ fontSize: '0.85rem' }` | Sidebar group labels |
| `FONT.navItem` | `{ fontSize: '0.8rem' }` | Sidebar child labels |
| `FONT.toolbar` | `{ fontSize: '0.85rem' }` | ModuleBar breadcrumbs |
| `FONT.toolbarAction` | `{ fontSize: '0.8rem' }` | ModuleBar filter inputs |
| `FONT.caption` | `{ fontSize: '0.75rem' }` | Small captions |

Composite sx presets (spread into component `sx`):

| Preset | Contains | Purpose |
|---|---|---|
| `tenantBarSx` | `bgcolor`, `height` | TenantBar AppBar root |
| `moduleBarSx` | `position`, `top`, `bgcolor`, `borderBottom`, `minHeight` | ModuleBar sticky container |
| `sidebarPaperSx(width)` | `width`, `transition` | Sidebar Drawer paper |
| `pageContainerSx` | `height: 100%`, `display: flex`, `flexDirection: column` | Full-height flex column for DataGrid page wrapper |
| `formGridSx` | `display: grid`, `gridTemplateColumns: 1fr 1fr`, `gap: 2` | Two-column grid layout for form sections |
| `formFullSpanSx` | `gridColumn: 1 / -1` | Full-width span inside formGridSx |
| `formGroupCardSx` | Extends `formGridSx` + `p: 2`, `border`, `borderRadius` | Bordered card for repeatable form groups (addresses, phones) |
| `formSectionHeaderSx` | `display: flex`, `justifyContent: space-between` | Header row + add button layout |

#### 6.1.3 Theme Overrides Reference

All MUI component overrides defined in `theme.js`:

| Component | Override Type | What It Sets | Replaces |
|---|---|---|---|
| `MuiAppBar` | defaultProps + styleOverrides | `elevation: 0`, bottom divider border | Per-instance `elevation={0}` |
| `MuiToolbar` | styleOverrides (dense) | `minHeight: 48` | Toolbar sx `minHeight` |
| `MuiDrawer` | styleOverrides (paper) | `boxSizing`, `backgroundColor`, `borderRight`, `overflowX` | Sidebar paper sx visual props |
| `MuiCard` | defaultProps + styleOverrides | `elevation: 1`, `borderRadius: 8` | Per-card sx |
| `MuiButton` | styleOverrides | `textTransform: 'none'`, small `fontSize: 0.8rem` | Button sx `textTransform`, `FONT.toolbarAction` |
| `MuiToggleButton` | styleOverrides | `textTransform: 'none'`, small `fontSize`, `padding` | ToggleButton sx in ModuleBar |
| `MuiListItemButton` | styleOverrides | `borderRadius: 8` | Sidebar ListItemButton `borderRadius: 1` |
| `MuiListItemIcon` | styleOverrides | `minWidth: 36` | Sidebar ListItemIcon `minWidth: 36` |
| `MuiChip` | styleOverrides (sizeSmall) | `fontWeight: 600`, `fontSize: 0.75rem` | TenantBar Chip sx |
| `MuiAvatar` | named variant `"header"` | 32 × 32, primary colours, cursor pointer, 0.8rem bold | TenantBar Avatar sx block |
| `MuiDialogActions` | styleOverrides | `paddingLeft: 24`, `paddingRight: 24`, `paddingBottom: 16` | Dialog button row padding |
| `MuiDialogContent` | styleOverrides (dividers) | `paddingTop: 16` for divider variant | Spacing for dialog content with divider |
| `MuiDataGrid` | defaultProps + styleOverrides | `density: compact`, `disableColumnMenu`, border removal, column/footer dividers, `.row-archived { opacity: 0.5 }` | Compact grid with row muting |

### 6.2 Navigation System

Navigation is configured via `navigationConfig.js` with capability-based filtering. The sidebar supports up to 3 levels of nesting: a child item with a `children` array (no `path`) renders as a collapsible sub-group; a child with a `path` (no `children`) renders as a leaf nav item.

```
Primary Group -> Sub-modules -> Leaf items
  Admin (AdminPanelSettingsIcon)
    +-- Manage Employees (/tenant/manage-employees)
    +-- Roles (/tenant/manage-roles)
    +-- Tenants (sub-group, NAP only)
        +-- Manage Tenants (/tenant/manage-tenants)
        +-- Manage Users (/tenant/manage-users)
```

Extensible design: add new groups/modules to `NAV_ITEMS` array with optional `capability` guards. Sub-groups inherit capability filtering recursively — a sub-group is visible if any of its children pass the capability check.

### 6.3 Module Bar (Dynamic Toolbar)

The Module Bar has two zones:

- **Left zone**: Current module name and breadcrumb trail (e.g., `Admin > Manage Employees > Edit`). The module name is derived from the active navigation group; breadcrumbs reflect the current route hierarchy. Breadcrumb segments are clickable links for back-navigation.
- **Right zone**: Dynamic toolbar actions registered by page components via `useModuleToolbarRegistration()`:
  - **Tabs**: Toggle button groups with exclusive/non-exclusive selection
  - **Filters**: Text fields or select dropdowns
  - **Primary Actions**: Action buttons (Create, Edit, Archive, Restore, etc.)

### 6.4 Dependencies (Client)

| Package | Version | Purpose |
|---|---|---|
| `@mui/material` | ^5.15.16 | UI component library |
| `@mui/x-data-grid` | ^6.4.0 | Data grid for tables |
| `@mui/x-charts` | ^6.4.0 | Charting library (cashflow charts, profitability charts) |
| `@tanstack/react-query` | ^5.28.0 | Server state management |
| `react-router-dom` | ^7.9.6 | Client-side routing |

### 6.5 Reusable Component Patterns

Guidelines for maintaining consistency as the UI grows:

**sx Prop Guidelines:**
- Never duplicate a style in `sx` that the theme already provides. Check `theme.js` overrides first.
- Use `sx` only for: (a) conditional/dynamic values driven by props or state, (b) structural positioning (`position`, `top`, `zIndex`), (c) per-instance spacing (`px`, `py`, `mb`, `gap`).
- Spread layout token presets (e.g., `...moduleBarSx`) instead of inlining the same values.

**Typography in Navigation:**
- Sidebar group labels: spread `FONT.navGroup` into `primaryTypographyProps`.
- Sidebar child labels: spread `FONT.navItem` into `primaryTypographyProps`.
- ModuleBar breadcrumbs: use `FONT.toolbar`.
- Active-state font weight (`fontWeight: 600`) stays in `sx` because it is conditional.

**Named Variants:**
- Use MUI named variants for component "shapes" that differ from the global default but recur in multiple places (e.g., `variant="header"` on `Avatar`).
- Define new variants in `theme.js` → `components.Mui*.variants[]`.

**Future Extraction Rules:**
- When three or more pages share the same layout pattern (e.g., list + detail pane), extract a shared wrapper component.
- Data-grid column definitions that repeat across modules should be centralised in a `columnDefs/` config folder.
- Form field groupings that appear in multiple create/edit dialogs should become reusable form section components.

---

## 7. Navigation Structure (Target)

Based on the sidebar navigation config and server module structure:

| Primary Group | Sub-Modules | Path Prefix |
|---|---|---|
| **Dashboard** | Overview, Company Cashflow Summary | `/dashboard` |
| **Projects** | Project List, Project Detail, Project Profitability | `/projects` |
| **Budgets** | Budget Management | `/budgets` |
| **Actual Costs** | Cost Tracking | `/actual-costs` |
| **Change Orders** | Change Order Management | `/change-orders` |
| **AP** | Vendors, AP Invoices, Payments, Credit Memos, AP Aging | `/ap` |
| **AR** | Clients, AR Invoices, Receipts, AR Aging | `/ar` |
| **Accounting & GL** | Chart of Accounts, Journal Entries, Ledger, Intercompany | `/accounting` |
| **Reports** | Budget vs Actual, Profitability, Cashflow, Margin Analysis, P&L, Balance Sheet | `/reports` |
| **Admin** | Manage Employees, Roles, **Tenants** (Manage Tenants, Manage Users — NAP only) | `/tenant` |

---

## 8. Environment Configuration

| Variable | Purpose | Default |
|---|---|---|
| `DATABASE_URL_DEV/TEST/PROD` | PostgreSQL connection string | — |
| `REDIS_URL` | Redis connection for permission caching | — |
| `ACCESS_TOKEN_SECRET` | JWT access token signing key | — |
| `REFRESH_TOKEN_SECRET` | JWT refresh token signing key | — |
| `ROOT_EMAIL` | Super user email for bootstrap | — |
| `ROOT_PASSWORD` | Super user password for bootstrap | — |
| `CORS_ORIGINS` | Comma-separated allowed origins | `CLIENT_ORIGIN` |
| `CLIENT_ORIGIN` | Frontend URL | `http://localhost:5173` |
| `COOKIE_SECURE` | Secure cookie flag | `false` (dev) |
| `COOKIE_SAMESITE` | SameSite cookie policy | `Lax` |
| `BCRYPT_ROUNDS` | Password hashing cost | 12 |
| `NAPSOFT_TENANT` | NapSoft tenant code for admin access | `NAP` |
| `VITE_NAPSOFT_TENANT` | Client-side NapSoft tenant code | `NAP` |
| `VITE_NAPSOFT_COMPANY` | Client-side NapSoft company name (reserved, not currently used) | `NapSoft` |
| `VITE_NAPSOFT_EMAIL_DOMAIN` | Client-side NapSoft email domain (reserved, not currently used) | `napsoft.com` |

---

## 9. Testing Strategy

| Suite | Location | Purpose |
|---|---|---|
| **Unit** | `tests/unit/` | Controller logic, middleware behavior, JWT/passport utils |
| **Integration** | `tests/integration/` | API endpoint tests with seeded data via pg-schemata `bulkInsert()` |
| **Contract** | `tests/contract/` | Router/controller API contract verification |
| **RBAC** | `tests/rbac/` | Permission resolution, deny overrides, system roles, module restrictions |

All tests use Vitest with dependency injection for controllers and JWT fixtures from `tests/setup.js`. Test database setup uses pg-schemata's `bootstrap()` for isolated test schemas.

---

## 10. Coding Standards & Best Practices

### 10.1 Naming Conventions

| Context | Convention | Example |
|---|---|---|
| **DB tables** | snake_case (plural) | `ap_invoices`, `cost_lines`, `vendor_skus` |
| **DB columns** | snake_case | `tenant_id`, `invoice_date`, `total_amount` |
| **JS/TS variables & functions** | camelCase | `invoiceTotal`, `findByCode()`, `parseToken()` |
| **Classes & React components** | PascalCase | `TableModel`, `Vendors`, `ManageTenantsPage`, `AuthContext` |
| **Constants & env vars** | SCREAMING_SNAKE_CASE | `ACCESS_TOKEN_SECRET`, `BCRYPT_ROUNDS`, `MAX_PAGE_SIZE` |
| **URL paths & route segments** | kebab-case | `/api/ar/v1/ar-invoices`, `/tenant/manage-users` |
| **File names (modules)** | camelCase for utils, PascalCase for classes/components | `authRedis.js`, `Vendors.js`, `ManageTenantsPage.jsx` |
| **File names (schemas)** | camelCase matching table | `apInvoicesSchema.js`, `vendorsSchema.js` |
| **CSS classes / tokens** | camelCase (MUI sx) or kebab-case (CSS modules) | `sx={{ marginTop: 2 }}` |
| **Event handlers** | `handle` + Event | `handleRowClick`, `handleSubmit`, `handleArchive` |
| **Boolean variables** | `is`/`has`/`can`/`should` prefix | `isActive`, `hasPermission`, `canApprove` |
| **Enums / status values** | snake_case strings | `'in_progress'`, `'change_order'`, `'pending'` |

### 10.1.1 Single Canonical Names (No Aliases)

Every concept, variable, parameter, and config key must have **exactly one name** throughout the codebase. Never accept multiple synonyms for the same value or create alias maps to normalize variant spellings. Ambiguity in naming is a bug factory.

**Bad — alias maps that normalize synonyms:**
```javascript
// DON'T: multiple names for the same concept
const aliasMap = {
  development: 'DEV', dev: 'DEV',
  production: 'PROD', prod: 'PROD',
  test: 'TEST', testing: 'TEST',
};
```

**Bad — fallback chains that accept multiple property names:**
```javascript
// DON'T: guessing which key the caller used
const rawGroups = rule.max_by_groups || rule.max_by_group;
const clinicId = clinicIdBody || clinicIdSnake || req.clinicId || req.user.clinicId;
```

**Good — one name, enforced everywhere:**
```javascript
// DO: pick one name and require it
const envSuffix = { development: 'DEV', production: 'PROD', test: 'TEST' }[NODE_ENV];
// Callers must use `max_by_groups` (plural) — the singular form is a bug, not a variant
const { max_by_groups } = rule;
```

**Rules:**
- Pick one canonical name per concept and use it everywhere (API, DB, UI, config)
- If an external API sends a different name, map it **once at the boundary** — never spread aliases through internal code
- Never silently accept misspellings or abbreviations; fail loudly so the caller fixes the source
- Environment variables, config keys, and request parameters each have exactly one accepted name

### 10.2 File & Module Structure

**Keep modules small and focused.** Each file should have a single, clear responsibility.

**Server-side module layout has two tiers:**

`src/modules/` contains the **core platform modules** that are always required and glue the application together:

- **`auth`** — authentication (login, JWT, session management)
- **`tenants`** — multi-tenant administration (tenants, nap_users tables)
- **`core`** — tables required by all optional modules (sources, vendors, clients, employees, contacts, addresses, inter_companies, RBAC)

`Modules/` (at the `nap-serv` root, sibling to `src/`) contains **optional feature modules** that tenants enable based on their needs:

- **`projects`** — Project management, units, tasks, cost items, change orders, templates
- **`activities`** *(planned)* — Activity tracking
- **`bom`** *(planned)* — Bill of Materials
- **`ar`** *(planned)* — Accounts Receivable
- **`ap`** *(planned)* — Accounts Payable
- **`accounting`** *(planned)* — General Ledger, Chart of Accounts
- **`cashflow`** *(planned)* — Cashflow & Profitability
- **`reports`** *(planned)* — Reporting

Both tiers follow the same internal layout:

```
<module>/                        # Inside src/modules/ or Modules/
  schemas/                       # pg-schemata schema definitions (one per table)
    apInvoicesSchema.js
    apInvoiceLinesSchema.js
  models/                        # TableModel subclasses (one per table)
    ApInvoices.js
    ApInvoiceLines.js
  controllers/                   # Business logic (one per resource)
    apInvoicesController.js
  apiRoutes/
    v1/                          # Versioned route definitions
      apInvoicesRouter.js
  services/                      # Cross-cutting business logic (optional)
    postingService.js
  <module>Repositories.js        # Repository map for moduleRegistry
  schema/migrations/             # Module-specific migrations
    index.js
```

Optional modules in `Modules/` import core platform code via relative paths to `src/` (e.g., `../../../src/lib/BaseController.js`). All modules — core and optional — are registered in `src/db/moduleRegistry.js` and mounted in `src/apiRoutes.js`.

**Client-side page layout:**
```
src/
  pages/
    <Module>/                  # PascalCase module folder
      <Page>Page.jsx           # Page component (one per route)
      components/              # Page-specific sub-components
      hooks/                   # Page-specific custom hooks
  components/                  # Shared/reusable components
  hooks/                       # Shared custom hooks
  contexts/                    # React context providers
  services/                    # API client functions
  utils/                       # Pure utility functions
```

**Rules:**
- One class per file; file name matches class name
- One schema definition per file; file name matches table name (camelCase)
- Maximum ~200–300 lines per file; refactor if larger
- Group related exports via barrel `index.js` files at the module level

### 10.3 Copyright & File Headers

Every source file must include a copyright header as the first content:

**JavaScript / JSX:**
```javascript
/**
 * @file <Brief description of what this file does>
 * @module <module/path>
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */
```

**SQL migration files:**
```sql
-- Migration: <migration_id>
-- Description: <what this migration does>
-- Copyright (c) 2025 NapSoft LLC. All rights reserved.
```

### 10.4 Code Reuse & DRY Principles

**Function reuse hierarchy (prefer higher over lower):**
1. **pg-schemata built-ins** — Use `TableModel`/`QueryModel` methods before writing custom SQL
2. **Shared utilities** (`packages/shared/`) — Cross-cutting helpers used by both client and server
3. **Module-level services** (`services/`) — Business logic shared across controllers within a module
4. **Controller helpers** — Private functions within a controller file

**Anti-patterns to avoid:**
- Duplicating query logic across controllers — extract to the model or a service
- Copy-pasting validation rules — define once in the schema, use pg-schemata's auto-generated Zod validators
- Reimplementing CRUD — use `createRouter`; only override specific routes when business rules differ
- Inline SQL strings in controllers — use model methods or named service functions

### 10.5 Classes vs Functions

| Use Case | Pattern | Rationale |
|---|---|---|
| **Data models** | Class extending `TableModel` | Inheritance from pg-schemata; instance methods for custom queries |
| **Controllers** | Plain object with arrow functions | No state needed; dependency-injected with model references |
| **React components** | Function components + hooks | Modern React standard; hooks for state/effects |
| **Middleware** | Factory functions returning `(req, res, next)` | Composable; closures capture config |
| **Services** | Exported functions (module pattern) | Stateless business logic; easy to test and mock |
| **Utilities** | Pure exported functions | No side effects; maximum reusability |
| **Context providers** | Function component + `createContext` | React pattern for shared state |

**Never use:**
- Prototype-based inheritance (use ES6 classes or plain functions)
- `class` for React components (use function components exclusively)
- Singletons beyond `DB.init()` (use dependency injection instead)

### 10.6 Error Handling

**Server-side:**
- Use pg-schemata's `DatabaseError` and `SchemaDefinitionError` for data-layer errors
- Controllers wrap operations in try/catch; pass errors to Express `next(err)`
- Central error handler middleware maps error types to HTTP status codes:

| Error Type | HTTP Status | Response |
|---|---|---|
| `SchemaDefinitionError` (validation) | 400 | `{ error: 'Validation failed', details: [...] }` |
| `DatabaseError` (23505 unique) | 409 | `{ error: 'Duplicate record', constraint: '...' }` |
| `DatabaseError` (23503 FK) | 422 | `{ error: 'Referenced record not found' }` |
| RBAC deny | 403 | `{ error: 'Forbidden', required: '...', actual: '...' }` |
| Auth failure | 401 | `{ error: 'Unauthorized' }` |
| Not found | 404 | `{ error: 'Not found' }` |
| Unhandled | 500 | `{ error: 'Internal server error' }` (no stack in production) |

**Client-side:**
- React Query `onError` callbacks handle API errors globally
- Toast/snackbar notifications for user-facing errors
- Never swallow errors silently — always log or display

### 10.7 Import & Export Style

**ES Modules only** (no CommonJS):
```javascript
// Named exports (preferred for utilities, services, constants)
export function parseToken(token) { ... }
export const MAX_PAGE_SIZE = 100;

// Default export (only for classes and React components)
export default class Vendors extends TableModel { ... }
export default function ManageTenantsPage() { ... }

// Import order (enforce via ESLint):
// 1. Node built-ins
import { randomUUID } from 'node:crypto';
// 2. External packages
import express from 'express';
import { TableModel } from 'pg-schemata';
// 3. Internal modules (absolute paths from project root)
import { rbac } from '../../middleware/rbac.js';
// 4. Relative siblings
import { vendorsSchema } from '../schemas/vendorsSchema.js';
```

### 10.8 Comments & Documentation

- **JSDoc** on all exported functions with `@param`, `@returns`, and `@throws` tags
- **Inline comments** only for *why*, never *what* — the code should be self-documenting
- **TODO comments** must include a ticket/issue reference: `// TODO(NAP-123): Add retainage support`
- **No commented-out code** — use version control instead

### 10.9 Async & Concurrency

- All database operations are `async/await` — never use raw `.then()` chains
- Use `Promise.all()` for independent concurrent operations (e.g., parallel queries)
- Use `Promise.allSettled()` when partial failures are acceptable (e.g., batch notifications)
- pg-schemata bulk operations (`bulkInsert`, `bulkUpdate`, `bulkUpsert`) are automatically transaction-wrapped — do not wrap them in an additional transaction
- For multi-step business transactions (e.g., posting an invoice + creating GL entries), use pg-promise's `db.tx()` to ensure atomicity

### 10.10 Security Practices

- Never log sensitive data (passwords, tokens, PII) — redact before logging
- Always use parameterized queries (pg-schemata handles this automatically)
- Validate all input at the API boundary — pg-schemata's Zod validators cover schema validation; add business rule validation in controllers
- Never return `password_hash` or internal fields in API responses — use `columnWhitelist` or DTO mapping
- Environment secrets must never be committed — use `.env` files (gitignored) and validate required vars at startup
- All authorization must flow through the RBAC policy engine — no role-based bypass in middleware
- Entity deactivation (employee, vendor, client, or contact) must cascade to lock the corresponding `nap_users` login (business rule in controller, not FK — cross-schema)
- User creation (`nap_users` insert) requires the entity to already have `roles` assigned and `is_app_user = true`
- Roles must be assigned to an entity (non-empty `roles` array) before it can be flagged as an app user (`is_app_user`)

---

## 11. Developer Tooling

### 11.1 ESLint

**Version:** ESLint 9 with flat config (`eslint.config.js` at monorepo root)

**Configuration:**
- Base: `@eslint/js` recommended rules
- Plugin: `eslint-plugin-import` with alias resolver for clean imports
- Three environment-specific rule sets:
  - **Client** (`apps/nap-client/`): React/Vite globals, JSX support via Espree parser
  - **Server** (`apps/nap-serv/`): Node.js globals
  - **Tests** (`**/tests/**`): Vitest globals (`describe`, `it`, `expect`, `vi`, `beforeAll`, etc.)
- `no-unused-vars`: warning level with `_` prefix exception for intentionally unused params
- Console statements allowed (production logging handled by Winston)
- Formatting rules deferred to Prettier (no stylistic ESLint rules)

**Ignored paths:** `node_modules`, `dist`, `build`, `coverage`, `.vite`, `.turbo`, `.rollup.cache`

**Run:** `npm run lint` (root) or `npm run lint` (per-workspace)

### 11.2 Prettier

**Version:** Prettier 3

**Configuration (`prettier.config.mjs`):**

| Option | Value | Rationale |
|---|---|---|
| `semi` | `true` | Explicit statement termination |
| `singleQuote` | `true` | Consistency — single quotes for JS strings |
| `trailingComma` | `'all'` | Cleaner git diffs |
| `printWidth` | `144` | Wide format — reduces unnecessary line wrapping in schema definitions and table configs |
| `tabWidth` | `2` | Standard JS indentation |
| `useTabs` | `false` | Spaces only |
| `bracketSpacing` | `true` | `{ foo }` not `{foo}` |
| `arrowParens` | `'always'` | `(x) => x` not `x => x` |
| `jsxSingleQuote` | `false` | Double quotes in JSX attributes (HTML convention) |
| `endOfLine` | `'lf'` | Unix line endings only |

**Overrides:**
- Markdown files (`*.md`): `printWidth: 80` for readability

**Ignored paths (`.prettierignore`):** `node_modules`, `dist`, `build`, `coverage`, lockfiles, framework output directories, large assets

### 11.3 EditorConfig

**File:** `.editorconfig` at monorepo root

Ensures consistent whitespace across all editors/IDEs:
- All files: UTF-8, spaces, indent size 2, LF line endings, final newline, trim trailing whitespace
- Markdown: trailing whitespace preserved (significant for line breaks)
- Makefiles: tab indentation (required by Make)

### 11.4 Husky & Git Hooks

**Version:** Husky 9

**Pre-commit hook (`.husky/pre-commit`):**
1. Checks for staged changes (skips if nothing staged)
2. Runs `lint-staged` if available (ESLint + Prettier on staged files)
3. **Enforces commit separation**: rejects commits that touch files in both `apps/nap-client/` and `apps/nap-serv/` simultaneously — forces clean, single-concern commits per workspace
4. Bypass with `--no-verify` when necessary (e.g., monorepo-wide config changes)

**Setup:** `npm run prepare` installs Husky hooks via the `prepare` lifecycle script

### 11.5 VSCode Workspace

**File:** `nap.code-workspace` (multi-root workspace)

**Formatter assignments:**
- JavaScript/TypeScript/JSX/TSX: `esbenp.prettier-vscode` (Prettier extension)
- JSON/JSONC: VSCode built-in JSON formatter

**Recommended extensions** (add to workspace recommendations):
- `esbenp.prettier-vscode` — Prettier
- `dbaeumer.vscode-eslint` — ESLint
- `editorconfig.editorconfig` — EditorConfig

### 11.6 Vitest (Testing)

**Version:** Vitest 3 with `@vitest/coverage-v8`

**Configuration (`apps/nap-serv/vitest.config.js`):**

| Option | Value | Rationale |
|---|---|---|
| `environment` | `'node'` | Server-side testing |
| `globals` | `true` | No need to import `describe`/`test`/`expect` |
| `setupFiles` | `['tests/setup.js']` | Global test setup (DB fixtures, JWT helpers) |
| `pool` | `'threads'` (single thread) | Database tests require sequential execution |
| `sequence.concurrent` | `false` | Prevents test ordering issues with shared DB state |
| `coverage.provider` | `'v8'` | Native V8 coverage (fast) |
| `coverage.reporter` | `['text', 'html']` | Terminal output + HTML report |

**Test scripts (server):**

| Script | Command | Purpose |
|---|---|---|
| `test` | `cross-env NODE_ENV=test vitest` | Full suite |
| `test:unit` | Unit tests only | Controller logic, middleware |
| `test:integration` | Integration tests only | API endpoints with seeded data |
| `test:contract` | Contract tests only | Router/controller API contracts |
| `test:rbac` | RBAC tests only | Permission resolution |
| `test:coverage` | All tests + HTML coverage | Coverage reporting |

### 11.7 Vite (Client Build)

**Version:** Vite 7 with `@vitejs/plugin-react`

**Configuration (`apps/nap-client/vite.config.js`):**
- React plugin with automatic JSX transformation
- Dev server: port `5173`, auto-opens browser
- API proxy: `/api` requests forwarded to `http://localhost:3000` (Express backend)
- Build: source maps enabled for debugging

### 11.8 npm Workspaces

**Monorepo structure managed by npm workspaces:**

```json
// root package.json
{
  "workspaces": ["apps/*", "packages/*"]
}
```

**Root scripts:**

| Script | Command | Purpose |
|---|---|---|
| `dev` | `dev:serv & dev:client` | Start both server and client in parallel |
| `dev:serv` | `npm -w apps/nap-serv run dev` | Start Express dev server (nodemon, 5s delay) |
| `dev:client` | `npm -w apps/nap-client run dev` | Start Vite dev server |
| `build` | Sequentially builds server then client | Production build |
| `lint` | `eslint .` | Lint entire monorepo |
| `test` | Sequentially runs server then client tests | Full test suite |
| `prepare` | `husky` | Install git hooks |

**Server-specific scripts:**

| Script | Purpose |
|---|---|
| `setupAdmin:dev` | Run migrations + admin bootstrap (dev) |
| `setupAdmin:test` | Run migrations + admin bootstrap (test) |
| `migrate:dev` | Apply pending migrations (dev) |
| `migrate:test` | Apply pending migrations (test) |
| `seed` | Seed database with sample data |
| `seed:rbac` | Seed RBAC roles and policies |
| `docs` | Generate JSDoc documentation |
| `start` | Production server start |

### 11.9 Logging

**Server-side logging via Winston + Morgan:**
- **Winston**: Structured JSON logging for application events, errors, and audit trails
- **Morgan**: HTTP request logging (method, URL, status, response time)
- Log levels: `error`, `warn`, `info`, `http`, `debug`
- Production: `info` and above; Development: `debug` and above
- pg-schemata accepts an optional `logger` parameter on initialization for query-level logging

### 11.10 Environment Management

**`.env` files (gitignored):**
- `.env` — Local development defaults
- `.env.test` — Test environment overrides
- `.env.production` — Production config (never committed)

**No `.env.example` currently exists** — create and maintain a `.env.example` with all required variable names (no values) as a developer onboarding reference.

**Validation:** All required environment variables should be validated at server startup. Fail fast with a clear error message if any are missing.

---

## 12. Project Setup Guide

### 12.1 Prerequisites

Install these before starting:

| Tool | Version | Purpose | Install |
|---|---|---|---|
| **Node.js** | ≥ 20 | Runtime | [nodejs.org](https://nodejs.org) or `nvm install 20` |
| **npm** | ≥ 10 (ships with Node 20) | Package manager / workspaces | Included with Node |
| **PostgreSQL** | ≥ 15 | Database | `brew install postgresql@15` (macOS) or [postgresql.org](https://www.postgresql.org/download/) |
| **Redis** | ≥ 7 | Permission caching | `brew install redis` (macOS) or [redis.io](https://redis.io/download/) |
| **Git** | ≥ 2.40 | Version control | `brew install git` or [git-scm.com](https://git-scm.com) |
| **VSCode** | Latest | IDE | [code.visualstudio.com](https://code.visualstudio.com) |

**Optional but recommended:**
- **nvm** (Node Version Manager) — Switch Node versions per project
- **pgAdmin** or **DBeaver** — Visual database browser
- **Redis Insight** — Visual Redis browser

### 12.2 GitHub Repository Setup

#### Create the repository

```bash
# 1. Create project directory
mkdir nap && cd nap

# 2. Initialize git
git init
git branch -M main

# 3. Create the GitHub repo (using GitHub CLI)
gh repo create <org>/nap --private --source=. --remote=origin

# Or manually: create repo on github.com, then:
git remote add origin git@github.com:<org>/nap.git
```

#### Branch strategy

| Branch | Purpose | Merges From |
|---|---|---|
| `main` | Production-ready code | `develop` via PR |
| `develop` | Integration branch for next release | Feature branches via PR |
| `feat/<name>` | New features | — |
| `fix/<name>` | Bug fixes | — |
| `refactor/<name>` | Code restructuring | — |
| `chore/<name>` | Tooling, config, deps | — |

**Branch naming:** `<type>/<scope>-<short-description>` — e.g., `feat/serv-ar-invoices`, `fix/client-tenant-bar-dropdown`

#### Protect the main branch

```bash
# Via GitHub CLI
gh api repos/<org>/nap/branches/main/protection -X PUT -f \
  required_status_checks='{"strict":true,"contexts":["test"]}' \
  enforce_admins=true \
  required_pull_request_reviews='{"required_approving_review_count":1}'
```

Or configure in GitHub → Settings → Branches → Branch protection rules:
- Require pull request reviews before merging (1 approval)
- Require status checks to pass (lint, test)
- Require branches to be up to date before merging
- Do not allow bypassing the above settings

### 12.3 Clone & Install

```bash
# 1. Clone the repository
git clone git@github.com:<org>/nap.git
cd nap

# 2. Install all workspace dependencies (root + apps + packages)
npm install

# 3. Enable Husky git hooks
chmod +x .husky/pre-commit
```

`npm install` at the root automatically installs dependencies for all workspaces:
- `apps/nap-client/`
- `apps/nap-serv/`
- `packages/shared/`

### 12.4 VSCode Configuration

#### Open the workspace

```bash
code nap.code-workspace
```

Always open the project via the `.code-workspace` file — this ensures formatter and setting overrides are applied correctly.

#### Install required extensions

When prompted by VSCode, install the recommended extensions. Or install manually:

| Extension | ID | Purpose |
|---|---|---|
| **Prettier** | `esbenp.prettier-vscode` | Code formatting (format on save) |
| **ESLint** | `dbaeumer.vscode-eslint` | Lint errors inline |
| **EditorConfig** | `editorconfig.editorconfig` | Whitespace consistency |

**Recommended additional extensions:**

| Extension | ID | Purpose |
|---|---|---|
| **GitLens** | `eamodio.gitlens` | Enhanced git blame, history, and diff |
| **GitHub Pull Requests** | `github.vscode-pull-request-github` | Review PRs inside VSCode |
| **Thunder Client** or **REST Client** | `rangav.vscode-thunder-client` | Test API endpoints |
| **PostgreSQL** | `ckolkman.vscode-postgres` | Database browser and query runner |
| **ES6 String HTML** | `tobermory.es6-string-html` | Syntax highlighting for SQL template literals |
| **Error Lens** | `usernamehw.errorlens` | Inline error/warning display |

#### Suggested VSCode user settings

Add to your workspace settings (in `nap.code-workspace`) or user `settings.json`:

```jsonc
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.tabSize": 2,
  "editor.insertSpaces": true,
  "files.eol": "\n",
  "files.trimTrailingWhitespace": true,
  "files.insertFinalNewline": true,
  "eslint.useFlatConfig": true,
  "eslint.workingDirectories": [{ "mode": "auto" }],
  "search.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/coverage": true,
    "**/.vite": true
  }
}
```

### 12.5 Environment Setup

```bash
# 1. Copy the example env file (create one if it doesn't exist)
cp .env.example .env

# 2. Edit with your local values
```

**Required `.env` variables:**

```bash
# Database
DATABASE_URL_DEV=postgres://nap_user:password@localhost:5432/nap_dev
DATABASE_URL_TEST=postgres://nap_user:password@localhost:5432/nap_test

# Redis
REDIS_URL=redis://localhost:6379

# Auth
ACCESS_TOKEN_SECRET=<generate-a-random-secret>
REFRESH_TOKEN_SECRET=<generate-a-different-random-secret>

# Super User bootstrap
ROOT_EMAIL=admin@napsoft.com
ROOT_PASSWORD=<choose-a-strong-password>

# Client
CLIENT_ORIGIN=http://localhost:5173
CORS_ORIGINS=http://localhost:5173

# NapSoft identity
NAPSOFT_TENANT=NAP
VITE_NAPSOFT_TENANT=NAP
VITE_NAPSOFT_COMPANY=NapSoft
VITE_NAPSOFT_EMAIL_DOMAIN=napsoft.com
```

**Generate secrets:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 12.6 Database Setup

```bash
# 1. Create PostgreSQL user and databases
psql -U postgres -c "CREATE USER nap_user WITH PASSWORD 'password' CREATEDB;"
psql -U postgres -c "CREATE DATABASE nap_dev OWNER nap_user;"
psql -U postgres -c "CREATE DATABASE nap_test OWNER nap_user;"

# 2. Enable required extensions (connect to each database)
psql -U nap_user -d nap_dev -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
psql -U nap_user -d nap_dev -c "CREATE EXTENSION IF NOT EXISTS vector;"

psql -U nap_user -d nap_test -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
psql -U nap_user -d nap_test -c "CREATE EXTENSION IF NOT EXISTS vector;"

# 3. Run migrations and bootstrap the admin schema
npm -w apps/nap-serv run setupAdmin:dev

# 4. Seed sample data (optional)
npm -w apps/nap-serv run seed
npm -w apps/nap-serv run seed:rbac
```

### 12.7 Start Development

```bash
# Start both server (port 3000) and client (port 5173) concurrently
npm run dev

# Or start individually:
npm run dev:serv      # Express API on http://localhost:3000
npm run dev:client    # Vite React on http://localhost:5173
```

**Verify everything works:**
1. Open `http://localhost:5173` — should see the NAP login page
2. Log in with the `ROOT_EMAIL` / `ROOT_PASSWORD` from your `.env`
3. Test the API directly: `curl http://localhost:3000/api/auth/check`

### 12.8 Run Tests

```bash
# Full test suite
npm test

# Server tests by category
npm -w apps/nap-serv run test:unit
npm -w apps/nap-serv run test:integration
npm -w apps/nap-serv run test:contract
npm -w apps/nap-serv run test:rbac

# Coverage report (opens HTML report)
npm -w apps/nap-serv run test:coverage
```

### 12.9 Daily Development Workflow

```bash
# 1. Pull latest changes
git checkout develop
git pull origin develop

# 2. Create a feature branch
git checkout -b feat/serv-cashflow-reports

# 3. Make changes, commit with conventional commits
git add apps/nap-serv/Modules/reports/
git commit -m "feat(serv): add project profitability SQL views"

# 4. Push and create PR
git push -u origin feat/serv-cashflow-reports
gh pr create --base develop --title "feat(serv): add project profitability reports"

# 5. After PR is approved and merged, clean up
git checkout develop
git pull origin develop
git branch -d feat/serv-cashflow-reports
```

**Commit message format (Conventional Commits):**

```
<type>(<scope>): <short description>

[optional body]

[optional footer]
```

| Type | When to Use |
|---|---|
| `feat` | New feature or functionality |
| `fix` | Bug fix |
| `refactor` | Code restructuring (no behavior change) |
| `test` | Adding or updating tests |
| `docs` | Documentation changes |
| `chore` | Tooling, config, dependency updates |
| `style` | Formatting only (no code change) |
| `perf` | Performance improvement |

| Scope | When to Use |
|---|---|
| `serv` | Backend changes (`apps/nap-serv/`) |
| `client` | Frontend changes (`apps/nap-client/`) |
| `shared` | Shared package changes (`packages/shared/`) |
| `deps` | Dependency updates |
| (omit) | Root config or cross-cutting changes |

**Examples:**
```
feat(serv): add AR aging SQL view and report endpoint
fix(client): correct tenant bar dropdown not updating on switch
refactor(serv): extract posting logic into PostingService
test(serv): add RBAC integration tests for AP module
chore(deps): bump pg-schemata to 1.3.1
docs: update PRD with cashflow module specification
```

### 12.10 Husky Commit Rules

The pre-commit hook enforces:

1. **No mixed commits** — You cannot stage files from both `apps/nap-client/` and `apps/nap-serv/` in the same commit. This keeps the git history clean and scoped.

   ```bash
   # This will be REJECTED:
   git add apps/nap-serv/Modules/ar/ apps/nap-client/src/pages/AR/
   git commit -m "feat: add AR module"  # ❌ Mixed commit

   # Do this instead:
   git add apps/nap-serv/Modules/ar/
   git commit -m "feat(serv): add AR module API routes and controllers"

   git add apps/nap-client/src/pages/AR/
   git commit -m "feat(client): add AR invoice list page"
   ```

2. **Bypass when needed** — For legitimate cross-workspace changes (e.g., shared types, monorepo config):
   ```bash
   git commit -m "refactor: update shared API types" --no-verify
   ```

3. **lint-staged** — If configured, runs ESLint and Prettier on staged files only (fast)

### 12.11 Recommended `.nvmrc`

Create a `.nvmrc` at the monorepo root to pin the Node version:

```
20
```

Then any developer can run `nvm use` to switch to the correct version automatically.

### 12.12 Recommended `.env.example`

Maintain this file in version control as a developer reference:

```bash
# Database
DATABASE_URL_DEV=postgres://nap_user:password@localhost:5432/nap_dev
DATABASE_URL_TEST=postgres://nap_user:password@localhost:5432/nap_test
DATABASE_URL_PROD=

# Redis
REDIS_URL=redis://localhost:6379

# Auth (generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
ACCESS_TOKEN_SECRET=
REFRESH_TOKEN_SECRET=

# Super User bootstrap
ROOT_EMAIL=
ROOT_PASSWORD=

# Client
CLIENT_ORIGIN=http://localhost:5173
CORS_ORIGINS=http://localhost:5173

# Cookie
COOKIE_SECURE=false
COOKIE_SAMESITE=Lax

# Encryption
BCRYPT_ROUNDS=12

# NapSoft identity
NAPSOFT_TENANT=NAP
VITE_NAPSOFT_TENANT=NAP
VITE_NAPSOFT_COMPANY=NapSoft
VITE_NAPSOFT_EMAIL_DOMAIN=napsoft.com
```

---

## 13. Design Decision Records

### 13.1 Purpose

Design decisions capture the *why* behind architectural and technical choices. Code shows *what* was built; commit messages show *when*; design decisions explain *why one approach was chosen over alternatives*. Without this, future developers (or your future self) will waste time reverse-engineering intent, or worse, undo a deliberate choice without understanding the consequences.

### 13.2 Location

Design decisions live in a `docs/decisions/` directory at the monorepo root:

```
nap/
  docs/
    decisions/
      0001-schema-per-tenant-isolation.md
      0002-jwt-cookie-auth-over-localstorage.md
      0003-pg-schemata-over-knex-or-drizzle.md
      0004-keyset-pagination-over-offset.md
      0005-express5-over-fastify.md
      ...
    architecture.md             # High-level architecture overview
    auth-rbac.md                # Auth & RBAC deep dive
    developer-guide.md          # Developer onboarding (links to PRD §12)
    domain-model.md             # Entity relationship documentation
```

**Rules:**
- Decisions are **numbered sequentially** (`0001`, `0002`, ...) — never renumber
- Decisions are **append-only** — never edit a past decision; supersede it with a new one
- Decisions are **committed to the repo** — they travel with the code, not in a wiki or Notation

### 13.3 Template

Every design decision follows a lightweight ADR (Architecture Decision Record) format:

```markdown
# <NUMBER>. <Title>

**Date:** YYYY-MM-DD
**Status:** accepted | superseded by [XXXX] | deprecated
**Author:** <name>

## Context

What is the problem or situation that requires a decision? What constraints exist?

## Decision

What was decided? Be specific.

## Alternatives Considered

| Alternative | Pros | Cons |
|---|---|---|
| Option A | ... | ... |
| Option B | ... | ... |

## Consequences

What are the implications of this decision — both positive and negative?
What trade-offs were accepted?
```

### 13.4 When to Write a Decision Record

Write a decision record when:
- Choosing between two or more viable approaches (e.g., ORM choice, auth strategy)
- Adopting a pattern that will be used project-wide (e.g., soft deletes, audit fields)
- Making a choice that would be non-obvious to a new developer reading the code
- Reversing or changing a previous decision
- Adding or removing a significant dependency

Do **not** write a decision record for:
- Obvious choices with no realistic alternatives
- Implementation details that are easily changed later
- Bug fixes or routine feature work

### 13.5 Initial Decisions to Document

The following decisions should be captured as the project is built from scratch:

| # | Decision | Key Rationale |
|---|---|---|
| 0001 | Schema-per-tenant isolation over row-level tenancy | Complete data isolation; independent schema migrations; zero cross-tenant query risk |
| 0002 | pg-schemata as ORM over Knex/Drizzle/Prisma | Owned dependency; Postgres-first; schema-driven DDL; built-in migration manager |
| 0003 | JWT in httpOnly cookies over localStorage tokens | XSS protection; automatic transmission; no client-side token management |
| 0004 | Three-level RBAC (none/view/full) over boolean permissions | Granular read vs write control; hierarchical policy resolution |
| 0005 | Keyset pagination over offset-based | Stable performance at scale; no skipped/duplicate rows on concurrent inserts |
| 0006 | Express 5 over Fastify/Koa | Mature ecosystem; team familiarity; async error handling improvements in v5 |
| 0007 | Redis for permission caching over in-memory | Shared across server instances; survives process restarts; TTL expiration |
| 0008 | Soft deletes over hard deletes | Audit trail; undo capability; referential integrity preserved |
| 0009 | Derived cashflow views over dedicated cashflow tables | Single source of truth; no data sync issues; real-time accuracy |
| 0010 | Conventional Commits over freeform messages | Parseable history; automated changelog potential; scope-based filtering |
| 0011 | Monorepo with npm workspaces over separate repos | Shared code; unified tooling; atomic cross-package changes |
| 0012 | pgvector embeddings for SKU matching over fuzzy string matching | Semantic similarity; language-agnostic; scales with catalog size |

### 13.6 Referencing Decisions

When code implements a non-obvious pattern that traces back to a design decision, reference it:

**In code comments:**
```javascript
// See decision 0005: keyset pagination chosen over offset for stable large-set performance
const results = await model.findAfterCursor(cursor, limit, orderBy);
```

**In PR descriptions:**
```markdown
## Summary
Implements schema-per-tenant provisioning via pg-schemata bootstrap.

Relates to: [ADR-0001](docs/decisions/0001-schema-per-tenant-isolation.md)
```

**In commit messages (optional):**
```
feat(serv): add tenant schema provisioning

Implements ADR-0001 using pg-schemata bootstrap() for single-transaction
schema creation with extension setup.
```

