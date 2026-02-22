/**
 * @file Build prompts for each phase of the NAP greenfield implementation
 * @module docs/PROMPTS
 *
 * Each prompt is self-contained with enough context from prior phases
 * to be executed independently. The PRD (docs/PRD.md) is the source
 * of truth for all decisions.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

# NAP Build Prompts

> **Usage:** Each prompt below can be given to an AI coding assistant (or human developer) to implement that phase. Each prompt includes the necessary context from previous phases so it can stand alone.

---

## Phase 1 — Project Foundation & Infrastructure

### Prompt

You are building **NAP**, a multi-tenant construction ERP (PERN monorepo). The PRD at `docs/PRD.md` is the source of truth. The `nap` branch contains a prior implementation with established patterns — port and adapt that code rather than rewriting from scratch.

**Goal:** Establish the monorepo skeleton — package configs, server/client entry points, DB init, migration infrastructure, test framework, and a health endpoint.

#### Server (`apps/nap-serv/`)

Create the following files by porting from the `nap` branch (`git show nap:<path>`):

| File | Purpose |
|------|---------|
| `package.json` | deps: express ^5, pg-schemata ^1.3, passport, ioredis, winston, zod, bcrypt, jsonwebtoken, cors, cookie-parser, morgan, dotenv, multer; devDeps: vitest, supertest, nodemon, cross-env |
| `server.js` | Express listen on PORT 3000 |
| `src/app.js` | Middleware chain: cors → json → cookieParser → morgan → health → error handler (no auth yet) |
| `src/db/db.js` | `DB.init()` singleton, .env walk-up, schema binding |
| `src/db/moduleRegistry.js` | Central model + migration map (empty registrations) |
| `src/db/migrations/defineMigration.js` | Migration factory |
| `src/db/migrations/createMigrator.js` | Applies migrations with advisory locks |
| `src/lib/logger.js` | Winston logger (json format, level by NODE_ENV, silent in test) |
| `src/lib/envValidator.js` | Validate required env vars at startup, fail fast; `getDatabaseUrl()` switches on NODE_ENV |
| `src/middleware/errorHandler.js` | Central handler: DatabaseError → 409/422, SchemaDefinitionError → 400, unhandled → 500 |
| `vitest.config.js` | node env, single thread, setup file |

#### Client (`apps/nap-client/`)

| File | Purpose |
|------|---------|
| `package.json` | deps: react 18, react-dom, react-router-dom ^7, @mui/material ^5, @mui/icons-material, @mui/x-data-grid ^6, @mui/x-charts ^6, @tanstack/react-query ^5, @emotion/react, @emotion/styled; devDeps: vite ^7, @vitejs/plugin-react |
| `vite.config.js` | react plugin, envDir ../../, proxy /api → :3000, port 5173 |
| `index.html` | SPA entry |
| `src/main.jsx` | ReactDOM.createRoot, basic App render |
| `src/App.jsx` | Placeholder rendering "NAP" text |

#### Root

| File | Purpose |
|------|---------|
| `package.json` | workspaces: ["apps/*", "packages/*"], scripts: dev, dev:serv, dev:client, lint, test |
| `packages/shared/package.json` | Placeholder shared workspace |
| `prettier.config.mjs` | singleQuote, trailingComma: all, printWidth: 144, md override: 80 |
| `.editorconfig` | UTF-8, spaces, 2-indent, LF |
| `.env.example` | All required var names |
| `.husky/pre-commit` | lint-staged + mixed commit check (reject commits touching both apps/nap-client/ and apps/nap-serv/) |
| `eslint.config.js` | ESLint 9 flat config: @eslint/js recommended, eslint-plugin-import for server, client/server/test globals |

#### Tests

- `tests/unit/envValidator.test.js` — env validation logic
- `tests/unit/errorHandler.test.js` — error type → HTTP status mapping
- `tests/contract/health.test.js` — GET /api/health → 200

#### ADRs

- `docs/decisions/0001-schema-per-tenant-isolation.md`
- `docs/decisions/0002-pg-schemata-over-knex-drizzle.md`
- `docs/decisions/0003-jwt-httponly-cookies.md`

#### Conventions (apply to all files)

- Every file gets a NapSoft copyright header (PRD §10.3)
- Prettier: single quotes, trailing commas, 144-char lines, 2-space indent
- ESLint: unused vars warn with `^_` prefix ignore
- pg-schemata schema defaults use JS values (`default: 'active'`), NOT SQL literals
- `.env` lives at monorepo root; `db.js` walks up from cwd to find it
- Databases: dev → `nap_dev`, test → `nap_test`, user → `nap_admin`

#### Verification

```bash
npm install && npm run dev:serv && npm run dev:client
curl http://localhost:3000/api/health  # → 200
npm run lint && npm -w apps/nap-serv test
```

---

## Phase 2 — Admin Schema, Bootstrap & Authentication

### Prompt

You are continuing the NAP build. Phase 1 established the monorepo skeleton with Express 5 server, Vite React client, pg-schemata DB init, migration infrastructure, and a health endpoint.

**Goal:** Admin schema tables, bootstrap root tenant + super user, full auth flow, and a working client login page.

#### Context from Phase 1

The codebase has:
- `src/app.js` — Express middleware chain (cors → json → cookies → morgan → health → errorHandler)
- `src/db/db.js` — `DB.init()` singleton with .env walk-up
- `src/db/moduleRegistry.js` — Central module registry (empty)
- `src/lib/envValidator.js` — `getDatabaseUrl()` switches on NODE_ENV
- `src/lib/logger.js` — Winston logger
- `src/middleware/errorHandler.js` — Maps DatabaseError/SchemaDefinitionError to HTTP codes

#### Server — Auth Module (`src/modules/auth/`)

**Schemas** (in `schemas/`):

1. `tenantsSchema.js` — `admin.tenants` per PRD §3.2.1:
   - Columns: id (uuid PK), tenant_code (varchar 6, unique), company (varchar 128, unique), schema_name (varchar 63, unique), status (active/trial/suspended/pending), tier (enterprise/growth/starter), region, allowed_modules (jsonb, default []), max_users (int, default 5), billing_email, notes
   - Audit fields: `hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } }`
   - Soft delete: `softDelete: true`

2. `napUsersSchema.js` — `admin.nap_users` per PRD §3.2.2 (pure identity table):
   - Columns: id (uuid PK), tenant_id (uuid FK to tenants CASCADE), entity_type (varchar 16, nullable, CHECK IN employee/vendor/client/contact), entity_id (uuid, nullable), email (varchar 128), password_hash (text), status (active/invited/locked)
   - **Deliberately excluded:** tenant_code, user_name, full_name, tax_id, notes, role, tenant_role, employee_id
   - Partial unique: (email) WHERE deactivated_at IS NULL
   - Partial unique: (entity_type, entity_id) WHERE deactivated_at IS NULL
   - Index on tenant_id

3. `impersonationLogsSchema.js` — `admin.impersonation_logs`:
   - Columns: id, impersonator_id (FK nap_users), target_user_id (FK nap_users), target_tenant_code, reason, started_at, ended_at
   - Partial unique: (impersonator_id) WHERE ended_at IS NULL (prevents concurrent sessions)
   - Append-only (no soft delete)

4. `matchReviewLogsSchema.js` — `admin.match_review_logs`:
   - Columns: id, entity_type, entity_id, match_type, match_id, reviewer_id, decision (accept/reject/defer), notes

**Models** (in `models/`): Tenants, NapUsers, ImpersonationLogs, MatchReviewLogs — each extends `TableModel`.

**Services:**
- `services/tokenService.js` — JWT sign/verify for access (15m, claims: sub, ph, iss=nap-serv, aud=nap-serv-api) and refresh (7d, claims: sub only). Secrets from `ACCESS_TOKEN_SECRET` and `REFRESH_TOKEN_SECRET` env vars.
- `services/passportService.js` — Passport Local Strategy: validates email/password against admin.nap_users, checks user status (active), checks tenant status (active), attaches `user._tenant`.

**Infrastructure:**
- `src/lib/cookies.js` — `setAuthCookies(res, {accessToken, refreshToken})` and `clearAuthCookies(res)`. httpOnly, Secure (prod only), SameSite=Strict. Access token path `/`, refresh token path `/api/auth`.
- `src/lib/permHash.js` — `calcPermHash(canon)` — deterministic SHA-256 with recursive key sorting.
- `src/db/redis.js` — ioredis singleton with `getRedis()` and `closeRedis()`.
- `src/db/migrations/modelPlanner.js` — `isTableModel()`, `getModelKey()`, `getTableDependencies()`, `orderModels()` (topological FK sort), `dropTables()`.

**Middleware:**
- `src/middleware/authRedis.js` — Phase 2 simplified: bypass list (login, refresh, logout, health), verify JWT from `auth_token` cookie, look up user from admin.nap_users by sub claim, verify user active, look up tenant by user.tenant_id, populate `req.user`. Phase 3 adds RBAC, Redis cache, stale tokens, impersonation.

**Controller & Router:**
- `controllers/authController.js` — login (passport authenticate → sign tokens → set cookies), refresh (verify refresh → rotate tokens), logout (clear cookies), me (return user + tenant, exclude password_hash), check (lightweight 200), changePassword (bcrypt verify → validate strength [8+ chars, upper, lower, digit, special] → raw SQL update to avoid ColumnSet reset).
- `apiRoutes/v1/authRouter.js` — POST login/refresh/logout/change-password, GET me/check.

**Bootstrap Migration:**
- `schema/migrations/202502110001_bootstrapAdmin.js` — Uses modelPlanner to order table creation. Seeds NAP tenant (tenant_code: ROOT_TENANT_CODE, company: ROOT_COMPANY, tier: enterprise, schema_name: lowercase tenant code). Seeds super user (entity_type: null, entity_id: null — entity tables don't exist until Phase 5). Idempotent: checks by tenant_code and email before insert.

**Wiring:**
- `src/apiRoutes.js` — Mount authRouter at `/auth`
- Update `src/app.js` — Add authRedis middleware and apiRoutes after health, before 404/errorHandler
- Update `src/db/moduleRegistry.js` — Register auth module with repositories and migrations
- `scripts/setupAdmin.js` — Bootstrap admin schema, create pgschemata.migrations table, run admin-scope migrations
- Update `package.json` scripts — `setupAdmin:dev` and `setupAdmin:test`

**Auth repository map** (`authRepositories.js`): `{ tenants: Tenants, napUsers: NapUsers, impersonationLogs: ImpersonationLogs, matchReviewLogs: MatchReviewLogs }`

#### Client

| File | Purpose |
|------|---------|
| `src/theme.js` | `createAppTheme(mode)` — Light: primary #003e6b, secondary #f79c3c. Dark: primary #f6b21b, secondary #0ea5e9. Component overrides per PRD §6.1.3 (AppBar, Toolbar, Drawer, Card, Button, DataGrid, etc.) |
| `src/config/layoutTokens.js` | SIDEBAR_WIDTH_OPEN=242, SIDEBAR_WIDTH_COLLAPSED=110, TENANT_BAR_HEIGHT=48, MODULE_BAR_HEIGHT=48, fonts, composite sx presets |
| `src/services/client.js` | Fetch wrapper: credentials:include, x-tenant-code header, auto-refresh on 401 (shared promise), JSON parsing |
| `src/services/authApi.js` | login, logout, refresh, getMe, check, changePassword — thin wrappers around client.post/get |
| `src/contexts/AuthContext.jsx` | user, loading, login, logout, refreshUser, tenant, isNapSoftUser. Hydrates on mount via getMe(). |
| `src/pages/Auth/LoginPage.jsx` | Email/password form, error display, forcePasswordChange → ChangePasswordDialog |
| `src/components/shared/PasswordField.jsx` | TextField with visibility toggle |
| `src/components/shared/ChangePasswordDialog.jsx` | Current/new/confirm password, 5-rule strength checklist, forced mode |
| `src/components/layout/LayoutShell.jsx` | Phase 2: auth guard (loading spinner → redirect to /login → Outlet). Phase 3+ adds Sidebar/TenantBar/ModuleBar. |
| `src/pages/DashboardPage.jsx` | Placeholder showing user/tenant context |
| `src/App.jsx` | BrowserRouter: /login (public), / with LayoutShell guard → /dashboard |
| `src/main.jsx` | ThemedApp: OS dark mode detection → ThemeProvider → QueryClientProvider → AuthProvider → App |

#### Tests

- `tests/helpers/testDb.js` — `initTestDb()`, `bootstrapAdmin()`, `cleanupTestDb()`, `closeTestDb()`. Loads .env from monorepo root. Sets test env var defaults.
- `tests/unit/tokenService.test.js` — sign/verify, claims, TTL, cross-secret rejection
- `tests/unit/authRedis.test.js` — bypass paths, missing cookie, invalid JWT, valid JWT with mocked DB
- `tests/unit/permHash.test.js` — deterministic hashing, key-order independence
- `tests/unit/cookies.test.js` — set/clear, maxAge, secure in production
- `tests/unit/modelPlanner.test.js` — isTableModel (returns truthy, not strict boolean), dependency ordering
- `tests/integration/bootstrap.test.js` — tables created, root tenant/user seeded, PRD column compliance, idempotent re-run
- `tests/contract/auth.test.js` — all auth endpoints (login valid/invalid, me authed/unauthed, check, logout, refresh, change-password)

**Important pg-schemata notes:**
- `isTableModel()` returns truthy (the table name string), not strict boolean `true`
- `model.update(id, partialDto)` resets all ColumnSet columns to defaults — use raw SQL for single-column updates (e.g., password change)
- Schema defaults: JS values (`default: 'active'`), not SQL literals
- Audit fields with `userFields.type: 'uuid'` — created_by/updated_by must be uuid or null, never strings

#### ADRs & Docs

- `docs/decisions/0005-keyset-pagination.md`
- `docs/decisions/0006-express5.md`
- `docs/rules/auth.md` — token claims, cookie config, password requirements, middleware flow

#### Verification

```bash
npm -w apps/nap-serv run setupAdmin:dev   # creates admin schema + tables
npm -w apps/nap-serv test                  # all tests pass
npm -w apps/nap-client run build           # client builds
npm run lint                               # clean
```

---

## Phase 3 — RBAC System

### Prompt

You are continuing the NAP build. Phases 1-2 established the monorepo, admin schema (tenants, nap_users, impersonation_logs, match_review_logs), JWT auth flow, and client login page.

**Goal:** 4-layer RBAC — policies, data scope, state filters, field groups. Permission loading + Redis caching. Middleware enforcement. System role seeding. Base controller/router infrastructure.

#### Context from Phase 2

- `authRedis` middleware currently does JWT verify + user/tenant hydration with no RBAC
- `nap_users` is a pure identity table — no roles column. Roles will be read from entity records via `entity_type` + `entity_id` (entities created in Phase 5, but RBAC infra built now)
- Permission hash (`ph`) claim exists in JWT but is null
- Redis connection exists at `src/db/redis.js`
- `modelPlanner.js` handles topological table ordering
- `moduleRegistry.js` wires repositories and migrations per module
- Auth endpoints: POST login/refresh/logout/change-password, GET me/check

#### Server — RBAC Tables (PRD §3.1.2)

**Core module** (`src/modules/core/`):

Schemas (in `schemas/`, all with `dbSchema: 'public'` — overridden at runtime by pg-schemata):

1. `rolesSchema.js` — Per-tenant roles: id, tenant_code (varchar 6), code (varchar 32, unique per tenant), name (varchar 64), description, is_system (bool), is_immutable (bool), scope (all_projects/assigned_companies/assigned_projects/self)
2. `policiesSchema.js` — Permission grants: id, role_id (FK roles CASCADE), module (varchar 32), router (varchar 32), action (varchar 32), level (none/view/full), tenant_code
3. `policyCatalogSchema.js` — Registry of valid (module, router, action) combinations. Seed-only, no audit fields, no tenant_code.
4. `stateFiltersSchema.js` — (role_id, module, router, visible_statuses text[])
5. `fieldGroupDefinitionsSchema.js` — Named column groups: (module, router, group_name, columns text[], is_default bool)
6. `fieldGroupGrantsSchema.js` — (role_id, field_group_id)
7. `projectMembersSchema.js` — (project_id, user_id, role varchar)
8. `companyMembersSchema.js` — (company_id, user_id)

Migration: `202502110010_coreRbac.js` — Creates all RBAC tables in tenant schemas.

**Permission Engine:**
- `src/services/permissionLoader.js` — Load entity roles array (via entity_type + entity_id from nap_users) → query policies for matching role codes → resolve 4-layer policy fallback (module::router::action → module::router → module → default:none) → multi-role merge (most permissive scope wins, union statuses/columns) → build permission canon `{ caps, scope, projectIds, companyIds, entityType, entityId, stateFilters, fieldGroups }` → cache in Redis at `perm:{userId}:{tenantCode}` → compute SHA-256 hash
- `src/middleware/rbac.js` — `rbac(requiredLevel)` reads `req.resource` + `req.user.permissions`, returns 403 on deny. GET/HEAD default to `view`; mutations default to `full`.
- `src/middleware/withMeta.js` — `withMeta({ module, router, action })` annotates `req.resource`
- `src/middleware/moduleEntitlement.js` — Checks `tenants.allowed_modules` before RBAC
- `src/middleware/requireNapsoftTenant.js` — Gates NapSoft-only routes
- `src/middleware/addAuditFields.js` — Injects created_by/updated_by from req.user

**Base Infrastructure:**
- `src/lib/ViewController.js` — Base read controller with `_applyRbacFilters()` (layers 2-4: scope, state, fields). Controllers opt in via `this.rbacConfig = { module, router, scopeColumn, entityScopeColumns }`.
- `src/lib/BaseController.js` — Extends ViewController with write operations (create, update, archive, restore, bulkInsert, bulkUpdate, importXls, exportXls)
- `src/lib/createRouter.js` — Router factory: auto-generates REST routes (POST /, GET /, GET /where, GET /archived, GET /:id, POST /bulk-insert, PUT /update, DELETE /archive, PATCH /restore, import/export-xls) + applies addAuditFields to mutations

**Update `authRedis.js`:** Full permission loading from entity record's roles array, Redis cache read/write, stale token detection (X-Token-Stale: 1 header when ph diverges), permission hash computation.

**System Role Seeding:** super_user (NapSoft nap schema only: full access all modules + cross-tenant + impersonation), admin (all tenants: full access all modules), support (NapSoft only: full non-financial + cross-tenant + impersonation). ALL go through full RBAC resolution — no bypass.

**No RBAC Bypass:** The middleware does NOT short-circuit for super_user or admin. All users resolve through entity roles → policies.

#### Tests

- `tests/unit/permissionLoader.test.js` — Policy resolution (4-level fallback), multi-role merge
- `tests/unit/rbac.test.js` — Middleware enforcement at none/view/full
- `tests/unit/withMeta.test.js` — req.resource annotation
- `tests/unit/moduleEntitlement.test.js` — allowed_modules check
- `tests/unit/addAuditFields.test.js` — created_by/updated_by injection
- `tests/rbac/systemRoles.test.js` — super_user, admin, support resolution
- `tests/rbac/policyResolution.test.js` — 4-level fallback
- `tests/rbac/scopeFiltering.test.js` — all_projects > assigned_companies > assigned_projects > self
- `tests/rbac/denyOverride.test.js` — Layers 2-4 never expand beyond Layer 1
- `tests/rbac/staleToken.test.js` — X-Token-Stale header when ph diverges

#### ADRs & Docs

- `docs/decisions/0004-three-level-rbac.md` (initial)
- `docs/decisions/0007-redis-permission-cache.md`
- `docs/decisions/0013-four-layer-scoped-rbac.md` (supersedes 0004)
- `docs/rules/rbac.md` — All RBAC business rules

---

## Phase 4 — Tenant Management (Full Stack)

### Prompt

You are continuing the NAP build. Phases 1-3 established the monorepo, admin schema, JWT auth, and 4-layer RBAC with permission loading, Redis caching, base controller/router infrastructure, and system role seeding.

**Goal:** Tenant lifecycle (create/provision/archive/restore), user management (register/CRUD), admin operations (impersonation, cross-tenant). Full client shell with layout chrome, theme, sidebar, and tenant/user management pages.

#### Context from Phase 3

- `ViewController` and `BaseController` provide base CRUD with `_applyRbacFilters()`
- `createRouter` auto-generates REST routes with `addAuditFields`, `withMeta`, and `rbac()` middleware
- `permissionLoader.js` resolves entity roles → policies → Redis cache → permission hash
- `authRedis.js` now fully hydrates req.user with permissions from Redis
- `moduleEntitlement.js` checks `tenants.allowed_modules`
- `requireNapsoftTenant.js` gates NapSoft-only routes
- RBAC tables (roles, policies, etc.) exist in tenant schemas
- System roles (super_user, admin, support) are seeded during tenant provisioning
- `nap_users.entity_type` + `entity_id` link to entity records (null for bootstrap super user)

#### Server — Tenants Module (`src/modules/tenants/`)

**Controllers:**
- `tenantsController.js` — create (provisions schema: bootstrap tables + seed RBAC + seed admin role + create admin employee + create nap_user login in single tx), list (cursor pagination), get, update, archive (cascade deactivate all users), restore (reactivate users). Root tenant (NAP) cannot be archived → 403.
- `napUsersController.js` — register (validate entity exists with roles assigned + is_app_user = true, bcrypt hash password, create nap_user), list, get, update, archive (prevent self-archival, super_user unarchivable), restore (check tenant active).
- `adminController.js` — schemas list, impersonate (start), exit-impersonation, impersonation-status.
- `services/provisioningService.js` — bootstrap() new tenant schema → create all tables → seed RBAC + system roles + admin policies for all enabled modules.

**Impersonation in `authRedis.js`:** Redis `imp:{userId}` keys with TTL, swap req.user to target, set `req.user.is_impersonating` + `req.user.impersonated_by`, partial unique index prevents concurrent → 409.

#### Client — Full Layout Shell

| File | Purpose |
|------|---------|
| `src/components/layout/Sidebar.jsx` | Collapsible nav, 3-level nesting (group → sub-module → leaf), flyout menus when collapsed |
| `src/components/layout/TenantBar.jsx` | Tenant selector dropdown, user avatar with profile/settings menu |
| `src/components/layout/ModuleBar.jsx` | Left: module name + breadcrumbs. Right: dynamic toolbar actions |
| `src/components/layout/ImpersonationBanner.jsx` | Warning banner during active impersonation |
| `src/components/layout/LayoutShell.jsx` | Full version: auth guard, forced password change, Sidebar + TenantBar + ModuleBar + Outlet |
| `src/contexts/ModuleActionsContext.jsx` | Register toolbar actions from page components |
| `src/hooks/useModuleToolbarRegistration.js` | Hook for page toolbar registration |
| `src/config/navigationConfig.js` | Nav items with capability guards, 3-level nesting |

**Tenant Management Pages:**
- `ManageTenantsPage.jsx` — DataGrid: Code, Name, Status, Tier, Region. Module bar: Create, View, Edit, Archive, Restore. Create dialog includes admin user fields. Cursor pagination.
- `ManageUsersPage.jsx` — DataGrid: Email, Entity Type, Status. Register dialog. Archive/restore.
- Shared components: StatusChip, ConfirmDialog, FormDialog

**Styling rules:** Use `layoutTokens.js` for structural layout, `theme.js` overrides for visual defaults, inline `sx` only for dynamic/conditional values. MUI X Data Grid v6: `valueGetter(params)` uses `params.row.field` — the `(value, row)` form is v7 only.

#### Tests

- `tests/integration/tenantLifecycle.test.js` — Create → verify schema/tables/roles → archive → users deactivated → restore → reactivated
- `tests/integration/userRegistration.test.js` — Register (valid entity) → login → verify; reject without roles/is_app_user
- `tests/contract/tenants.test.js` — CRUD endpoints, root tenant (NAP) cannot be archived (403)
- `tests/contract/napUsers.test.js` — Register, CRUD, self-archival prevention, super_user unarchivable
- `tests/contract/admin.test.js` — schemas list, impersonation start/stop/status
- `tests/integration/impersonation.test.js` — start → req.user swap → audit log → concurrent rejected (409) → end

#### ADRs & Docs

- `docs/decisions/0008-soft-deletes.md`, `0010-conventional-commits.md`, `0011-monorepo-npm-workspaces.md`
- `docs/rules/tenants.md` — Provisioning, root tenant protection, user registration prerequisites, cascade rules

---

## Phase 5 — Core Entities

### Prompt

You are continuing the NAP build. Phases 1-4 established the monorepo, admin schema, JWT auth, 4-layer RBAC, tenant provisioning, user management, full client layout shell (Sidebar, TenantBar, ModuleBar), and tenant/user management pages.

**Goal:** Shared reference data — vendors, clients, employees, contacts with polymorphic sources, addresses, phone numbers, and inter-companies. Full management UI for employees and roles.

#### Context from Phase 4

- Tenant provisioning creates schema + RBAC tables + seeds system roles
- `createRouter` generates REST routes with RBAC enforcement
- `BaseController` provides create/update/archive/restore/bulk/import/export
- `nap_users` has `entity_type` + `entity_id` — currently null for bootstrap user. This phase creates the entity tables these link to.
- Entity deactivation must cascade to lock corresponding nap_users login (cross-schema business rule)
- Roles are stored as `text[]` on entity tables, not on nap_users

#### Server — Core Module Additions (`src/modules/core/`)

**Schemas** (all in tenant schemas with `dbSchema: 'public'`):

1. `sourcesSchema.js` — Polymorphic: id, tenant_id, table_id (uuid), source_type (CHECK: vendor/client/employee/contact), label
2. `vendorsSchema.js` — id, tenant_id, source_id (FK sources CASCADE), name, code (unique per tenant), tax_id, payment_terms, roles (text[], default '{}'), is_app_user (bool, default false), is_active (bool), notes
3. `clientsSchema.js` — id, tenant_id, source_id (FK sources CASCADE), name, code, email, tax_id, roles (text[]), is_app_user, is_active
4. `employeesSchema.js` — id, tenant_id, source_id (FK sources CASCADE), first_name, last_name, code, position, department, roles (text[]), is_app_user, is_primary_contact (bool), is_billing_contact (bool), is_active
5. `contactsSchema.js` — id, tenant_id, source_id (FK sources CASCADE), name, code, email, tax_id, roles (text[]), is_app_user, is_active (miscellaneous payees)
6. `addressesSchema.js` — id, source_id (FK sources CASCADE), label (billing/physical/mailing), address_line_1/2/3, city, state_province, postal_code, country_code (char 2), is_primary
7. `phoneNumbersSchema.js` — id, source_id (FK sources CASCADE, NOT NULL), phone_type (cell/work/home/fax/other), phone_number, is_primary
8. `interCompaniesSchema.js` — id, tenant_id, code (unique), name, tax_id, is_active

Migration: `202502110011_coreEntities.js`

**Business Logic:**
- Entity deactivation cascades to lock nap_users login (cross-schema, enforced in controller not FK)
- Roles array must be non-empty before is_app_user can be set to true
- is_app_user must be true before nap_users login can be created

#### Client

- `ManageEmployeesPage.jsx` — DataGrid with name, code, position, department, roles, is_app_user. Create/edit dialogs with address + phone sub-forms. Archive/restore.
- `ManageRolesPage.jsx` — Role CRUD + policy assignment grid (module × router × action matrix). System roles read-only.
- Shared components: AddressForm (formGroupCardSx), PhoneForm, EntitySearchSelect

#### Tests

- Contract tests for vendors, clients, employees, contacts, sources, addresses, phoneNumbers, interCompanies
- `tests/integration/entityCascade.test.js` — deactivate employee → nap_user locked → cannot login
- `tests/integration/rolesAssignment.test.js` — assign roles → set is_app_user → register nap_user → login
- `tests/integration/rolesValidation.test.js` — reject is_app_user without roles, reject nap_user without is_app_user

---

## Phase 6 — Projects Module

### Prompt

You are continuing the NAP build. Phases 1-5 established the full platform foundation: admin schema, auth, RBAC, tenant management, and core entities (vendors, clients, employees, contacts, sources, addresses, phones, inter-companies).

**Goal:** Project management — projects, units, tasks, cost items, change orders, and templates. Full project management UI.

#### Context from Phase 5

- Core entities exist in tenant schemas: vendors, clients, employees, contacts, sources, addresses, phone_numbers, inter_companies
- `createRouter` + `BaseController` provide standard CRUD with RBAC
- Entity tables have `roles` text[] and `is_app_user` columns
- `project_members` and `company_members` tables exist (from Phase 3 RBAC) for scope resolution

#### Server — Projects Module (`Modules/projects/`)

**Note:** Optional feature modules live in `Modules/` (at nap-serv root, sibling to `src/`). They import core platform code via relative paths (e.g., `../../../src/lib/BaseController.js`). Register in `moduleRegistry.js` and mount in `apiRoutes.js`.

**Schemas** (PRD §3.4):
1. `projectsSchema.js` — id, tenant_id, company_id (FK inter_companies RESTRICT), address_id (FK addresses SET NULL), project_code (unique per tenant), name, description, notes, status (planning→budgeting→released→complete), contract_amount (numeric 14,2)
2. `projectClientsSchema.js` — Junction: id, project_id (FK CASCADE), client_id (FK RESTRICT), role (varchar 32), is_primary. Unique: (project_id, client_id)
3. `unitsSchema.js` — id, project_id (FK CASCADE), template_unit_id (FK SET NULL), version_used, name, unit_code (unique per project), status (draft→in_progress→complete)
4. `taskGroupsSchema.js` — id, code (unique), name, description, sort_order
5. `tasksMasterSchema.js` — id, code (unique), task_group_code (FK RESTRICT), name, default_duration_days
6. `tasksSchema.js` — id, unit_id (FK CASCADE), task_code, name, duration_days, status (pending→in_progress→complete), parent_task_id (self-ref)
7. `costItemsSchema.js` — id, task_id (FK CASCADE), item_code, description, cost_class (labor/material/subcontract/equipment/other), cost_source (budget/change_order), quantity (numeric 12,4), unit_cost (numeric 12,4), amount (numeric 12,2, **GENERATED**: quantity * unit_cost)
8. `changeOrdersSchema.js` — id, unit_id (FK CASCADE), co_number, title, reason, status (draft→submitted→approved/rejected), total_amount

**Templates:** template_units, template_tasks, template_cost_items, template_change_orders
**Template Service:** Instantiate project from template (copy units → tasks → cost items)

Migration: `202502110020_projectTables.js`

**Circular FK note:** tasks.parent_task_id is self-referential — add via ALTER TABLE in migration after table creation.

#### Client

- `ProjectListPage.jsx` — DataGrid with status filters, create/edit dialogs, project_clients management
- `ProjectDetailPage.jsx` — Tabbed: Units, Tasks (hierarchical), Cost Items, Change Orders
- `TemplateManagementPage.jsx` — Template CRUD

#### Tests

- Contract tests for projects, units, tasks, costItems, changeOrders, templates, projectClients
- `tests/integration/projectLifecycle.test.js` — create → add units → add tasks → add cost items → change order workflow
- `tests/integration/templateInstantiation.test.js` — create from template → verify children copied
- `tests/integration/generatedColumns.test.js` — cost_items.amount = quantity * unit_cost

---

## Phase 7 — Activities & Cost Management

### Prompt

You are continuing the NAP build. Phases 1-6 established admin, auth, RBAC, tenants, core entities, and the projects module (projects, units, tasks, cost items, change orders, templates).

**Goal:** Categorical cost tracking — categories, activities, deliverables, budgets, cost lines, actual costs, vendor parts. Budget approval workflow.

#### Context from Phase 6

- Projects module in `Modules/projects/` with projects, units, tasks, cost_items, change_orders
- `cost_items.amount` is a generated column (quantity * unit_cost)
- Templates support project instantiation
- Inter-companies, vendors, clients exist in core entities

#### Server — Activities Module (`Modules/activities/`)

**Schemas** (PRD §3.5):
1. `categoriesSchema.js` — id, code, name, type (labor/material/subcontract/equipment/other)
2. `activitiesSchema.js` — id, category_id (FK CASCADE), code, name, is_active
3. `deliverablesSchema.js` — id, name, description, status (pending→released→finished→canceled), start_date, end_date
4. `deliverableAssignmentsSchema.js` — deliverable_id (FK CASCADE), project_id (FK CASCADE), employee_id (FK optional), notes
5. `budgetsSchema.js` — id, deliverable_id (FK CASCADE), activity_id (FK CASCADE), budgeted_amount, version (int, >0), is_current (bool), status (draft→submitted→approved→locked/rejected), submitted_by/at, approved_by/at
6. `costLinesSchema.js` — id, company_id (FK RESTRICT), deliverable_id (FK CASCADE), vendor_id, activity_id (FK CASCADE), budget_id (FK SET NULL), tenant_sku, source_type, quantity, unit_price, amount (**GENERATED**: quantity * unit_price), markup_pct, status (draft→locked→change_order)
7. `actualCostsSchema.js` — id, activity_id (FK CASCADE), project_id (FK SET NULL), amount, currency, reference, approval_status (pending→approved→rejected), incurred_on
8. `vendorPartsSchema.js` — id, vendor_id (FK CASCADE), vendor_sku, tenant_sku, unit_cost, currency, markup_pct, is_active

Migration: `202502110040_activityTables.js`

**Budget Service:** Approval workflow, version management — approved → read-only, new changes → new version. Actual cost validation: budget tolerance checks.

#### Client

- `BudgetManagementPage.jsx` — Budget list, approval workflow, version history
- `CostTrackingPage.jsx` — Actual costs DataGrid, budget variance
- `DeliverablePage.jsx` — Deliverable list with assignments

#### Tests

- Contract tests for categories, activities, deliverables, budgets, costLines, actualCosts, vendorParts
- `tests/integration/budgetLifecycle.test.js` — create → submit → approve → lock → verify read-only
- `tests/integration/budgetVersioning.test.js` — modify approved → new version created
- `tests/integration/actualCostValidation.test.js` — validate against budget tolerance

---

## Phase 8 — BOM Module

### Prompt

You are continuing the NAP build. Phases 1-7 established admin, auth, RBAC, tenants, core entities, projects, and activities/cost management.

**Goal:** Bill of materials — catalog SKUs, vendor SKUs with pgvector embeddings, vendor pricing, AI-powered similarity matching, match review.

#### Context from Phase 7

- Vendors exist in core entities with code, tax_id, payment_terms
- Activities module provides cost tracking infrastructure
- `admin.match_review_logs` table exists from Phase 2
- PG extension `vector` is created per-schema as needed

#### Server — BOM Module (`Modules/bom/`)

**Schemas** (PRD §3.6):
1. `catalogSkusSchema.js` — id, catalog_sku (unique), description, description_normalized, category, sub_category, model (varchar 32), embedding (vector 3072)
2. `vendorSkusSchema.js` — id, vendor_id (FK RESTRICT), vendor_sku, description, description_normalized, catalog_sku_id (FK SET NULL), confidence (float), model, embedding (vector 3072). Custom methods: findBySku, getUnmatched, refreshEmbeddings
3. `vendorPricingSchema.js` — id, vendor_sku_id (FK CASCADE), unit_price, unit, effective_date

Migration: `202502110030_bomTables.js` — includes `CREATE EXTENSION IF NOT EXISTS vector`

**Matching Service:** Cosine similarity search using pgvector, confidence scoring, threshold filtering.

**Wire match_review_logs endpoint** in tenants module at `/api/tenants/v1/match-review-logs`

#### Client

- `CatalogPage.jsx` — Catalog SKU DataGrid with category/sub-category filters
- `VendorSkuMatchingPage.jsx` — Unmatched vendor SKUs, match suggestions with confidence scores, accept/reject/defer

#### ADRs & Docs

- `docs/decisions/0012-pgvector-sku-matching.md`
- `docs/rules/bom.md` — Matching workflow, confidence thresholds, review decisions

---

## Phase 9 — AP, AR & Accounting

### Prompt

You are continuing the NAP build. Phases 1-8 established admin, auth, RBAC, tenants, core entities, projects, activities/cost management, and BOM.

**Goal:** Accounts payable (invoices, payments, credit memos), accounts receivable (invoices, receipts), general ledger (chart of accounts, journal entries, posting, intercompany). GL hooks wire AP/AR into double-entry accounting.

#### Context from Phase 8

- Vendors, clients, inter-companies, projects exist with full CRUD
- Activities provide categories, deliverables, budgets, cost lines
- `project_id` FKs on AP/AR invoices and journal entries enable cashflow tracking
- Budget approval workflow is in place

#### Server — AP Module (`Modules/ap/`)

**Schemas** (PRD §3.7):
1. `apInvoicesSchema.js` — id, company_id (FK RESTRICT), vendor_id (FK RESTRICT), project_id (FK SET NULL), invoice_number, invoice_date, due_date, total_amount, status (open→approved→paid→voided)
2. `apInvoiceLinesSchema.js` — id, invoice_id (FK CASCADE), cost_line_id (FK SET NULL), activity_id (FK SET NULL), account_id (FK RESTRICT), description, amount
3. `paymentsSchema.js` — id, vendor_id (FK RESTRICT), ap_invoice_id (FK SET NULL), payment_date, amount, method (check/ach/wire), reference
4. `apCreditMemosSchema.js` — id, vendor_id (FK RESTRICT), ap_invoice_id (FK SET NULL), credit_number, credit_date, amount, status (open→applied→voided)

**AP Posting Service:** Invoice approval triggers GL posting (debit expense/WIP, credit AP liability).

Migration: `202502110050_apTables.js`

#### Server — AR Module (`Modules/ar/`)

**Schemas** (PRD §3.8):
1. `arInvoicesSchema.js` — id, company_id (FK RESTRICT), client_id (FK RESTRICT), project_id (FK SET NULL), deliverable_id (FK SET NULL), invoice_number, invoice_date, due_date, total_amount, status (open→sent→paid→voided)
2. `arInvoiceLinesSchema.js` — invoice_id (FK CASCADE), account_id (FK RESTRICT), description, amount
3. `receiptsSchema.js` — client_id (FK RESTRICT), ar_invoice_id (FK SET NULL), receipt_date, amount, method, reference

**AR Posting Service:** Invoice posting debits AR, credits revenue.

Migration: `202502110060_arTables.js`

#### Server — Accounting Module (`Modules/accounting/`)

**Schemas** (PRD §3.9):
1. `chartOfAccountsSchema.js` — id, code, name, type (asset/liability/equity/income/expense/cash/bank), is_active, cash_basis, bank_account_number, routing_number, bank_name
2. `journalEntriesSchema.js` — id, company_id (FK RESTRICT), project_id (FK SET NULL), entry_date, description, status (pending→posted→reversed), source_type, source_id, corrects_id (self-ref SET NULL)
3. `journalEntryLinesSchema.js` — entry_id (FK CASCADE), account_id (FK RESTRICT), debit (numeric default 0), credit (numeric default 0), memo, related_table, related_id
4. `ledgerBalancesSchema.js` — account_id (FK RESTRICT), as_of_date, balance
5. `postingQueuesSchema.js` — journal_entry_id (FK CASCADE), status (pending→posted→failed), error_message, processed_at
6. `categoryAccountMapSchema.js` — category_id (FK RESTRICT), account_id (FK RESTRICT), valid_from, valid_to
7. `interCompanyAccountsSchema.js` — source_company_id, target_company_id, inter_company_account_id (FK RESTRICT), is_active. Unique: (tenant_id, source_company_id, target_company_id)
8. `interCompanyTransactionsSchema.js` — source/target company IDs, source/target journal_entry_ids, module, status
9. `internalTransfersSchema.js` — from_account_id, to_account_id, transfer_date, amount

**GL Posting Service:** Validate balance (debits = credits), post entries, update ledger balances. Reject unbalanced entries.
**Intercompany Service:** Paired journal entries (due-to/due-from), elimination flags.
**GL Hooks:** AP approval → GL entries auto-created. AR posting → GL entries auto-created.

Migration: `202502110070_accountingTables.js`

#### Client

- AP pages: ApInvoiceListPage, ApInvoiceDetailPage, PaymentsPage, CreditMemosPage
- AR pages: ArInvoiceListPage, ArInvoiceDetailPage, ReceiptsPage
- Accounting pages: ChartOfAccountsPage, JournalEntriesPage, JournalEntryDetailPage, IntercompanyPage

#### Tests

- Contract tests for all AP, AR, accounting entities
- `tests/integration/apLifecycle.test.js` — create → add lines → approve → pay → status progression
- `tests/integration/arLifecycle.test.js` — create → send → receive payment
- `tests/integration/glPosting.test.js` — post JE → verify ledger balances
- `tests/integration/doubleEntry.test.js` — reject unbalanced entries
- `tests/integration/apGlHook.test.js` — AP approval → GL entries auto-created
- `tests/integration/arGlHook.test.js` — AR posting → GL entries auto-created
- `tests/integration/intercompany.test.js` — paired JE creation

#### ADRs & Docs

- `docs/decisions/0009-derived-cashflow-views.md`
- `docs/rules/ap.md`, `docs/rules/ar.md`, `docs/rules/accounting.md`

---

## Phase 10 — Reporting, Views & Dashboards

### Prompt

You are continuing the NAP build. Phases 1-9 established the complete transactional system: admin, auth, RBAC, tenants, core entities, projects, activities, BOM, AP, AR, and accounting with GL hooks.

**Goal:** SQL views for profitability, cashflow, aging. Report API endpoints. Full dashboard with MUI X Charts. Export views.

#### Context from Phase 9

- All transactional tables exist: projects, ar_invoices, receipts, ap_invoices, payments, actual_costs, cost_items, journal_entries, journal_entry_lines, chart_of_accounts
- `project_id` FKs on AP/AR invoices and journal entries enable project-level analysis
- GL posting is operational; AP/AR hooks create journal entries automatically
- Budget approval workflow with version management exists

#### Server — Reports Module (`Modules/reports/`)

**SQL Views Migration** (`202502120080_sqlViews.js`) — Creates in each tenant schema (PRD §3.10.4, §3.11):

1. `vw_project_profitability` — Per-project metrics: contract_amount, invoiced/collected revenue, outstanding AR, budgeted/committed/actual cost, gross profit/margin, net cashflow, budget variance, estimated cost at completion, projected profit/margin
2. `vw_project_cashflow_monthly` — Monthly inflow/outflow with cumulative totals
3. `vw_project_cost_by_category` — Cost by activity category with budget vs actual variance
4. `vw_ar_aging` — Aging buckets (current, 30, 60, 90, 90+) by client/project
5. `vw_ap_aging` — Aging buckets by vendor/project
6. `vw_export_contacts` — Unified contacts across entity types
7. `vw_export_addresses` — Unified addresses
8. `vw_export_template_cost_items`, `vw_template_tasks_export`

**Controllers** (read-only, extend ViewController/QueryModel):
- profitabilityController, cashflowController, agingController, marginController
- All endpoints under `/api/reports/v1/` per PRD §3.10.5

**Views Module** (`Modules/views/`):
- `/api/views/v1/contacts`, `/addresses`, `/template-cost-items`, `/template-tasks`

#### Client

| Page | Purpose |
|------|---------|
| `DashboardPage.jsx` | Summary cards (Contract Value, Revenue, Gross Profit, Margin %, Net Cashflow), status indicators (green/yellow/red), project list with drill-down |
| `CompanyCashflowPage.jsx` | Aggregated cashflow across projects for a company |
| `ProjectProfitabilityPage.jsx` | DataGrid with all §3.10.2 metrics, conditional formatting (red negative margins, green healthy), Excel export |
| `CashflowTimelinePage.jsx` | MUI X Charts: stacked area (monthly inflows vs outflows), cumulative net trend, forecast region (dashed), toggle actual/forecast/combined |
| `BudgetVsActualPage.jsx` | Original budget, change orders, actual, total exposure, variance |
| `ArAgingPage.jsx` | Aging buckets grouped by client, filterable by project |
| `ApAgingPage.jsx` | Aging buckets grouped by vendor |
| `MarginAnalysisPage.jsx` | Cross-project margin comparison and trending |

#### Tests

- `tests/integration/profitabilityView.test.js` — Seed full dataset → query vw_project_profitability → verify all metrics
- `tests/integration/cashflowView.test.js` — Monthly aggregation, cumulative totals
- `tests/integration/agingView.test.js` — Bucket allocation based on due dates
- `tests/contract/reports.test.js` — All report endpoints return correct structure
- `tests/integration/exportViews.test.js` — Export views return unified data
- `tests/integration/fullSmoke.test.js` — **End-to-end:** create tenant → entities → project → budget → AP/AR → GL → reports → verify dashboard metrics

#### Docs

- `docs/rules/reporting.md` — Metric calculations, view definitions

---

## Cross-Cutting Notes (All Phases)

### Code Conventions

- **Copyright header:** Every file gets `/** @file ... @module ... Copyright (c) 2025 NapSoft LLC. */`
- **Prettier:** single quotes, trailing commas, 144-char lines (80 for markdown), 2-space indent
- **ESLint:** `eslint-plugin-react` for client JSX, `eslint-plugin-import` for server
- **No `Co-Authored-By`** in commit messages
- **Split commits:** Husky rejects mixed commits touching both `apps/nap-client/` and `apps/nap-serv/`

### pg-schemata Patterns

- Schema defaults: JS values (`default: 'active'`), NOT SQL literals (`default: "'active'"`)
- Audit fields: `hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } }`
- `isTableModel()` returns truthy (table name string), not strict boolean `true`
- `model.update(id, dto)` resets all ColumnSet columns — use raw SQL for partial updates
- Circular FKs: remove from schema, add via ALTER TABLE in migration
- Soft delete: `softDelete: true` — uses `deactivated_at` column

### Migration Testing (Every Phase)

- Fresh schema creation (bootstrap on empty DB)
- Migration idempotency (re-run doesn't fail)
- Checksum validation (modified migration detected)
- Full drop-and-recreate cycle

### MUI X Data Grid (v6)

- `valueGetter(params)` uses `params.row.field` — the `(value, row)` form is v7 only
- `renderCell` receives `(params)` — use `params.row` or `{ value }`
- Default to `density: compact`, `disableColumnMenu: true` per theme overrides

### Module File Structure

```
<module>/
  schemas/           # One per table (camelCase)
  models/            # One per table (PascalCase, extends TableModel)
  controllers/       # One per resource
  apiRoutes/v1/      # Versioned route definitions
  services/          # Cross-cutting business logic
  <module>Repositories.js  # Repository map for moduleRegistry
  schema/migrations/ # Module-specific migrations
```

Core modules in `src/modules/` (auth, tenants, core). Optional modules in `Modules/` at nap-serv root (projects, activities, bom, ap, ar, accounting, reports, views).
