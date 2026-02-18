# NAP — Build Prompts

Each prompt below corresponds to a build phase. Run them sequentially — each phase depends on the previous ones being complete and verified. Reference the PRD at `/Users/ian/Code/nap/PRD.md` for full specifications.

> **Usage:** Copy a prompt into Claude Code (CLI or VSCode extension). After each phase, verify the deliverables before moving to the next prompt.

---

## Phase 1 — Project Scaffold

```
Implement Phase 1: Project Scaffold per PRD §1.4, §11, and §12.

Create the full monorepo structure from scratch:

1. Initialize the monorepo root with package.json (npm workspaces: apps/*, packages/*)
   - Set "type": "module", engines >= Node 20
   - Add all root scripts: dev, dev:serv, dev:client, build, lint, test, prepare

2. Create apps/nap-client/:
   - package.json with React 18, Vite 7, MUI 5, React Router 7, TanStack React Query 5, Emotion
   - vite.config.js with React plugin, dev server on port 5173, API proxy to localhost:3000
   - Minimal src/main.jsx and src/App.jsx that renders "NAP" so we can verify it loads

3. Create apps/nap-serv/:
   - package.json with Express 5, pg-promise, pg-schemata 1.3.0, Passport, jsonwebtoken, bcrypt, ioredis, Winston, Zod, cors, cookie-parser, morgan, multer, cross-env, dotenv
   - Dev dependencies: vitest, @vitest/coverage-v8, supertest, eslint, nodemon
   - vitest.config.js per PRD §11.6
   - All scripts: dev, start, test, test:unit, test:integration, test:contract, test:rbac, test:coverage, setupAdmin:dev, setupAdmin:test, migrate:dev, migrate:test, seed, seed:rbac, lint
   - Minimal server.js and app.js that starts Express on port 3000 with a health check at GET /api/health

4. Create packages/shared/:
   - package.json for @nap/shared with "type": "module"
   - src/index.js placeholder

5. Root tooling configs per PRD §11:
   - eslint.config.js (ESLint 9 flat config with client/server/test environments)
   - prettier.config.mjs (144 printWidth, single quotes, trailing commas, LF)
   - .prettierignore
   - .editorconfig
   - .husky/pre-commit (lint-staged + no mixed client/server commits)
   - nap.code-workspace (Prettier formatter assignments)
   - .gitignore (comprehensive Node/build/env ignores)
   - .nvmrc (20)
   - .env.example per PRD §12.12

6. Create the docs/ directory structure per PRD §13.2:
   - docs/decisions/ (empty, ready for ADRs)
   - docs/architecture.md (placeholder)
   - docs/auth-rbac.md (placeholder)
   - docs/developer-guide.md (placeholder)
   - docs/domain-model.md (placeholder)

Reference: /Users/ian/Code/nap/PRD.md

After creating all files, run: npm install, npm run lint, and verify both dev servers start with npm run dev.
```

**Verify before next phase:**
- `npm install` succeeds
- `npm run lint` passes
- `npm run dev:serv` → `http://localhost:3000/api/health` returns OK
- `npm run dev:client` → `http://localhost:5173` renders the app

---

## Phase 2 — Database & pg-schemata Foundation

```
Implement Phase 2: Database & pg-schemata Foundation per PRD §2.1, §2.2, and §5.

The Phase 1 project scaffold is complete. Now build the database layer:

1. Create apps/nap-serv/src/db/ directory:
   - index.js: DB.init() singleton setup importing all model repositories, exports db() accessor
   - Use pg-schemata's DB.init(connectionString, repositories, logger) pattern per PRD §2.2.4
   - setAuditActorResolver() integration with AsyncLocalStorage for per-request user tracking

2. Create the admin schema models (PRD §3.2.1, §3.2.2):
   - Modules/tenants/schemas/tenantsSchema.js — admin.tenants table definition (admin/billing contacts determined via nap_users.tenant_role, not FK)
   - Modules/tenants/schemas/napUsersSchema.js — admin.nap_users table definition (includes full_name, tax_id, notes, status, tenant_role, employee_id FK; email has global unique partial index WHERE deactivated_at IS NULL)
   - Modules/tenants/schemas/napUserPhonesSchema.js — admin.nap_user_phones table (user_id FK, phone_type, phone_number, is_primary)
   - Modules/tenants/schemas/napUserAddressesSchema.js — admin.nap_user_addresses table (user_id FK, address_type, address_line_1/2/3, city, state_province, postal_code, country_code ISO 3166-1 alpha-2, is_primary)
   - Modules/tenants/schemas/matchReviewLogsSchema.js — admin.match_review_logs
   - Modules/tenants/schemas/impersonationLogsSchema.js — admin.impersonation_logs (impersonation audit trail)
   - Modules/tenants/models/Tenants.js — extends TableModel
   - Modules/tenants/models/NapUsers.js — extends TableModel (with password hash exclusion)
   - Modules/tenants/models/MatchReviewLogs.js — extends TableModel
   - All schemas must use hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } } and softDelete: true

3. Create the migration infrastructure:
   - apps/nap-serv/src/migrations/admin/ directory for admin schema migrations
   - apps/nap-serv/src/migrations/tenant/ directory for tenant schema migrations
   - Migration runner script that uses pg-schemata's MigrationManager
   - First migration (202502110001): bootstrap admin schema — creates tenants, nap_users, nap_user_phones, nap_user_addresses, match_review_logs, impersonation_logs tables

4. Create the bootstrap/setup script:
   - setupAdmin.js: Creates admin schema, runs migrations, seeds root super user (from ROOT_EMAIL/ROOT_PASSWORD env vars)
   - Uses pg-schemata bootstrap() for initial table creation
   - Hashes root password with bcrypt

5. Create the RBAC schema and models (tenant-scope, PRD §3.1.2):
   - Modules/tenants/schemas/rolesSchema.js — roles table
   - Modules/tenants/schemas/roleMembersSchema.js — role_members table
   - Modules/tenants/schemas/policiesSchema.js — policies table
   - Corresponding model files extending TableModel

6. Create a tenant provisioning service:
   - When a new tenant is created, use pg-schemata bootstrap() to create the tenant schema and all tenant-scope tables in a single transaction
   - Seed default roles (admin, project_manager) and policies into the new schema

7. Environment config:
   - apps/nap-serv/src/config/index.js — loads and validates all required env vars at startup, fails fast if missing

8. Add copyright headers to all files per PRD §10.3.

Reference: /Users/ian/Code/nap/PRD.md

After creating all files, run setupAdmin:dev to verify migrations execute and the admin schema is created with seeded data. Write unit tests for the tenant provisioning service.
```

**Verify before next phase:**
- `npm -w apps/nap-serv run setupAdmin:dev` succeeds
- Admin schema exists with `tenants`, `nap_users` tables
- Root super user is seeded
- `npm -w apps/nap-serv run test:unit` passes

---

## Phase 3 — Auth & RBAC

```
Implement Phase 3: Authentication & RBAC per PRD §3.1.

Phases 1-2 are complete — the database layer, admin schema, and RBAC tables exist. Now build the full auth stack:

1. Passport.js Local Strategy:
   - apps/nap-serv/src/auth/passportStrategy.js
   - Validates email/password against admin.nap_users using bcrypt
   - Returns user object with id, email, tenant_code, tenant_id

2. JWT utilities:
   - apps/nap-serv/src/auth/jwt.js
   - signTokens(user, permissions): creates auth_token (15min) and refresh_token (7-day) with claims per PRD §3.1.1
   - verifyToken(token, secret): verifies and decodes JWT
   - Token claims: sub, ph (permissions hash), iss ('nap-serv'), aud ('nap-serv-api'). Tenant context and role are NOT in the JWT — resolved at request time by authRedis middleware.

3. Redis permission caching:
   - apps/nap-serv/src/auth/permissionCache.js
   - Uses ioredis client
   - cachePermissions(userId, tenantCode, permissions): stores at perm:{userId}:{tenantCode}
   - getPermissions(userId, tenantCode): retrieves cached permissions
   - computePermissionHash(permissions): SHA-256 hash for token ph claim
   - clearPermissions(userId, tenantCode): invalidation

4. Auth middleware:
   - apps/nap-serv/src/middleware/authRedis.js
   - Extracts auth_token from httpOnly cookie
   - Verifies JWT, resolves tenant, loads permissions from Redis
   - Compares permission hash (ph claim) vs cached — sets X-Token-Stale: 1 header if diverged
   - Populates req.user, req.tenant, req.permissions

5. RBAC middleware:
   - apps/nap-serv/src/middleware/rbac.js
   - withMeta({ module, router, action }): annotates req.resource
   - rbac(requiredLevel): enforces permission level using policy resolution hierarchy per PRD §3.1.2
   - Resolution order: module::router::action → module::router:: → module:::: → none
   - Returns 403 with detailed deny payload on failure
   - super_user bypasses all checks; can only be assigned to NapSoft tenant users

6. Auth routes:
   - Modules/auth/apiRoutes/v1/authRouter.js
   - POST /api/auth/login — authenticate, cache permissions in Redis, set httpOnly cookies
   - POST /api/auth/refresh — full token rotation
   - POST /api/auth/logout — clear cookies, invalidate Redis cache
   - POST /api/auth/change-password — change password (validates current password, enforces strength rules)
   - GET /api/auth/me — return user context with tenant, roles, permissions, impersonation state
   - GET /api/auth/check — lightweight session validation

7. Cookie configuration:
   - httpOnly: true, secure: COOKIE_SECURE env, sameSite: COOKIE_SAMESITE env
   - auth_token: 15 minute maxAge
   - refresh_token: 7 day maxAge

8. Audit field middleware:
   - apps/nap-serv/src/middleware/addAuditFields.js
   - POST: injects tenant_code, created_by from req.user
   - PUT/PATCH/DELETE: injects updated_at, updated_by

9. Wire everything into app.js:
   - CORS, JSON parsing, cookie-parser, Morgan logging
   - Auth routes mounted at /api/auth
   - authRedis() applied to all /api/* routes except /api/auth/login and /api/health

10. Write tests:
    - tests/unit/: JWT sign/verify, permission hash, RBAC resolution logic, audit field injection
    - tests/rbac/: permission resolution, deny overrides, super_user bypass, module restrictions
    - tests/integration/: login flow, token refresh, logout, /me endpoint

Add copyright headers to all files per PRD §10.3.

Reference: /Users/ian/Code/nap/PRD.md
```

**Verify before next phase:**
- Login with root email/password returns cookies
- `GET /api/auth/me` returns user context
- Token refresh works
- RBAC denies unauthorized access with 403
- All auth and RBAC tests pass

---

## Phase 4 — Tenant Management API

```
Implement Phase 4: Tenant Management API per PRD §3.2.

Phases 1-3 are complete — auth, RBAC, and database foundation are working. Now build the tenant management module:

1. Create the base controller pattern:
   - apps/nap-serv/src/lib/BaseController.js — generic CRUD controller factory
   - Implements: create, list (findAfterCursor), getById, getWhere, getArchived, bulkInsert, bulkUpdate, update, archive (removeWhere), restore (restoreWhere), importXls, exportXls
   - All operations use the pg-schemata model methods per PRD §4.1
   - Handles errors via try/catch → next(err)

2. Create the base router pattern:
   - apps/nap-serv/src/lib/createRouter.js — generic route factory
   - Generates all standard REST routes per PRD §4.1: POST /, GET /, GET /where, GET /archived, GET /ping, GET /:id, POST /bulk-insert, POST /import-xls, POST /export-xls, PUT /bulk-update, PUT /update, DELETE /archive, PATCH /restore
   - Applies withMeta() and rbac() per route (GET/HEAD → view, mutations → full)
   - Applies addAuditFields middleware

3. Tenant CRUD:
   - Modules/tenants/controllers/tenantsController.js
   - Overrides create to: insert tenant record in admin schema → provision tenant schema via bootstrap() → seed default roles/policies/chart of accounts → create the Administrator user from the provided admin_user email, user_name, and password (hash password with bcrypt, assign `admin` role, set `tenant_role='admin'` on the user record)
   - Overrides archive to: cascade deactivate all tenant users via removeWhere(); reject archival of the root tenant (NAP) with 403
   - Overrides restore to: reactivate tenant and all associated users via restoreWhere()
   - Modules/tenants/apiRoutes/v1/tenantsRouter.js — uses createRouter with tenant-specific overrides

4. NapSoft-only access:
   - apps/nap-serv/src/middleware/requireNapsoftTenant.js
   - Checks req.user.tenant_code against NAPSOFT_TENANT env var
   - Returns 403 for non-NapSoft users
   - Applied to all tenant management routes

5. User CRUD:
   - Modules/tenants/controllers/napUsersController.js
   - Custom /register endpoint: collects email, user_name, full_name, password, phones array (each with phone_number, phone_type, is_primary), addresses array (each with address fields, is_primary), tenant_role, tax_id, notes. Hashes password with bcrypt, creates user record, and creates nap_user_phones/nap_user_addresses records for provided arrays.
   - Email must be globally unique across all active users (partial unique index WHERE deactivated_at IS NULL)
   - Disables standard POST (must use /register)
   - Archive: prevents self-archival; prevents archival of super_user role holders
   - Restore: checks parent tenant is active
   - Never returns password_hash in responses
   - Modules/tenants/apiRoutes/v1/napUsersRouter.js

6. Admin operations:
   - Modules/tenants/apiRoutes/v1/adminRouter.js
   - GET /schemas — list all active tenants (NapSoft users only, returns full tenant objects)
   - POST /impersonate — start impersonation session (requires target_user_id, NapSoft users only)
   - POST /exit-impersonation — end active impersonation session
   - GET /impersonation-status — check current impersonation state
   - Cross-tenant access: NapSoft users send `x-tenant-code` header to switch tenant context (no endpoint needed — handled by `authRedis` middleware)

7. Module registration:
   - apps/nap-serv/src/moduleRegistry.js — central registry that mounts all module routes
   - Register tenants module with its routes

8. Write tests:
   - tests/unit/: BaseController methods, requireNapsoftTenant middleware
   - tests/integration/: full tenant lifecycle (create → list → update → archive → restore), user registration, self-archive prevention
   - tests/contract/: tenant and user router API contracts

Add copyright headers to all files per PRD §10.3.

Reference: /Users/ian/Code/nap/PRD.md
```

**Verify before next phase:**
- Create a tenant → PostgreSQL schema is provisioned with all tables
- Register a user for that tenant → can login as that user
- Archive tenant → all users deactivated
- Restore tenant → users reactivated
- Non-NapSoft users get 403 on tenant routes
- All tests pass

---

## Phase 5 — Client Shell & Layout

```
Implement Phase 5: Client Shell & Layout per PRD §2.3, §6, and §7.

Phases 1-4 are complete — the server API is working with auth, RBAC, and tenant management. Now build the client application shell:

1. Theme system (PRD §6.1):
   - src/theme.js — MUI createTheme with light and dark mode palettes
   - Light: primary #003e6b, secondary #f79c3c, background #f5f5f5
   - Dark (GitHub-Dark): primary #f6b21b, secondary #0ea5e9, background #080B10
   - Custom background tokens: sidebar, header, surface
   - Automatic OS preference detection via useMediaQuery('(prefers-color-scheme: dark)')

2. API client:
   - src/services/client.js — fetch wrapper with credentials: 'include' for cookie transmission
   - Base methods: get, post, put, patch, del — all prepend /api/ prefix
   - Error handling: parse JSON errors, throw with status codes
   - src/services/authApi.js — login(), logout(), refresh(), getMe(), check()

3. Auth context (PRD §3.1.1 client-side):
   - src/contexts/AuthContext.jsx
   - Provides { user, loading, login, logout, refreshUser, tenant, isNapSoftUser, assumedTenant, assumeTenant, exitAssumption, impersonation, startImpersonation, endImpersonation }
   - On mount: calls getMe() to hydrate session from cookie
   - login(email, password): calls API, sets user state
   - logout(): calls API, clears user state, redirects to /login

4. Module Actions context (PRD §6.3):
   - src/contexts/ModuleActionsContext.jsx
   - Provides toolbar registration: tabs, filters, primaryActions
   - useModuleToolbarRegistration(config) hook for pages to register their toolbar

5. Layout components:
   - src/components/layout/LayoutShell.jsx — main layout wrapper
     - Guards authenticated routes (redirects to /login if user=null)
     - Shows loading spinner while auth is loading
     - Renders Sidebar + main content area (TenantBar + ModuleBar + Outlet)
   - src/components/layout/Sidebar.jsx — collapsible navigation (242px expanded, 110px collapsed)
     - Renders navigation groups from navigationConfig.js
     - Supports flyout menus when collapsed
     - Active item highlighting based on current route
   - src/components/layout/TenantBar.jsx — sticky top bar (48px)
     - Tenant selector dropdown (populated from user's available tenants)
     - User avatar (initials-based MUI Avatar) on the right with a dropdown menu containing:
       - User's full name and email (display only)
       - "My Profile" link (navigates to profile settings page)
       - "Settings" link (navigates to user settings page)
       - Divider
       - "Sign Out" action (calls logout)
   - src/components/layout/ModuleBar.jsx — sticky dynamic toolbar
     - Left zone: current module name + breadcrumb trail (e.g., `Settings > Manage Employees`). Module name derived from active nav group; breadcrumb segments are clickable links for back-navigation.
     - Right zone: renders tabs, filters, and primary action buttons from ModuleActionsContext

6. Navigation config (PRD §7):
   - src/config/navigationConfig.js — NAV_ITEMS array per PRD §7 navigation structure
   - Groups: Dashboard, Projects, Budgets, Actual Costs, Change Orders, AP, AR, Accounting & GL, Reports, Settings
   - Each item: { label, icon, path, children?, capability? }
   - Capability-based filtering (hide items user doesn't have permission for)

7. Routing:
   - src/App.jsx — React Router v7 setup
   - Public routes: /login
   - Protected routes: wrapped in LayoutShell
   - Route structure matching navigation config paths
   - Placeholder page components for each route (just renders the page title)

8. Login page:
   - src/pages/Auth/LoginPage.jsx
   - Email/password form with MUI components
   - Calls AuthContext.login() on submit
   - Error display for invalid credentials
   - Redirects to /dashboard on success

9. React Query setup:
   - src/main.jsx — QueryClientProvider wrapping the app
   - Default options: staleTime 5 minutes, retry 1

10. Entry point:
    - src/main.jsx — renders App inside ThemeProvider, AuthProvider, QueryClientProvider

Add copyright headers to all files per PRD §10.3.

Reference: /Users/ian/Code/nap/PRD.md

After implementation, verify: login flow works end-to-end, layout renders all four zones, sidebar navigation routes correctly, tenant bar shows current user, theme toggle works.
```

**Verify before next phase:**
- Login page authenticates against the API
- LayoutShell renders with all four zones
- Sidebar navigation works for all groups
- Tenant bar shows user info and sign-out works
- Theme switches between light and dark mode
- Unauthenticated users are redirected to /login

---

## Phase 6 — Tenant UI Pages

```
Implement Phase 6: Tenant Management UI per PRD §3.2 (UI Requirements).

Phases 1-5 are complete — the client shell, layout, and auth are working. Now build the tenant management pages with real data:

1. API hooks:
   - src/services/tenantApi.js — API functions: listTenants, getTenant, createTenant, updateTenant, archiveTenant, restoreTenant
   - src/services/userApi.js — API functions: listUsers, getUser, registerUser, updateUser, archiveUser, restoreUser
   - src/hooks/useTenants.js — React Query hooks: useTenantsQuery, useTenantMutation, useArchiveTenantMutation, useRestoreTenantMutation
   - src/hooks/useUsers.js — React Query hooks: useUsersQuery, useRegisterUserMutation, useArchiveUserMutation, useRestoreUserMutation

2. ManageTenantsPage (PRD §3.2.1 UI):
   - src/pages/Tenant/ManageTenantsPage.jsx
   - MUI X Data Grid displaying: Code, Tenant Name, Status, Tier, Region, Active
   - Status badges with color coding (active=green, trial=blue, suspended=red, pending=yellow)
   - Row selection with checkbox (single and multi-select)
   - Module Bar toolbar registration via useModuleToolbarRegistration():
     - Primary actions: Create Tenant, View Details, Edit Tenant, Archive, Restore
     - Actions enable/disable based on row selection
   - Pagination using cursor-based pagination from the API
   - Create tenant dialog: modal form with all tenant fields plus admin user fields (email, user_name, password) — these create the tenant's Admin user on submission
   - Edit tenant dialog: modal form with tenant fields (admin_user and billing_user shown as read-only references)
   - Archive confirmation dialog
   - Snackbar notifications for success/error

3. ManageUsersPage (PRD §3.2.2):
   - src/pages/Tenant/ManageUsersPage.jsx
   - MUI X Data Grid displaying: Email, User Name, Role, Status, Tenant Code
   - Module Bar toolbar: Register User, Edit User, Archive, Restore
   - Register user dialog with fields: email, user_name, full_name, password, phone 1 + type dropdown (cell/home/work/fax/other), phone 2 + type (optional), address 1 + type dropdown (home/work/mailing/other) with address_line_1/2/3, city, state_province, postal_code, country_code (optional), address 2 + type (optional), tax_id (optional), notes (optional), role
   - Archive: prevents self-archival (disable button if selected user is current user)
   - Restore: shows warning if parent tenant is inactive

4. Shared components:
   - src/components/StatusBadge.jsx — reusable color-coded status chip
   - src/components/ConfirmDialog.jsx — reusable confirmation dialog
   - src/components/FormDialog.jsx — reusable form dialog wrapper

Add copyright headers to all files per PRD §10.3.

Reference: /Users/ian/Code/nap/PRD.md

After implementation, verify: tenant CRUD operations work from the UI, user registration works, archive/restore cascades correctly, status badges display properly, pagination works.
```

**Verify before next phase:**
- Create tenant from UI → appears in grid
- Edit tenant → updates reflected
- Archive tenant → status changes, users deactivated
- Register user → can login as new user
- All toolbar actions work correctly
- Pagination works with large datasets

---

## Phase 7 — Core Entities

```
Implement Phase 7: Core Entities per PRD §3.3.

Phases 1-6 are complete. Now build the shared reference data module — vendors, clients, employees, and the polymorphic sources/contacts/addresses pattern:

1. Schemas (all tenant-scope, in Modules/core/schemas/):
   - sourcesSchema.js — discriminated union table (source_type: vendor/client/employee)
   - vendorsSchema.js — with source_id FK to sources (CASCADE)
   - clientsSchema.js — with source_id FK to sources (CASCADE)
   - employeesSchema.js — with source_id FK to sources (CASCADE)
   - contactsSchema.js — with source_id FK to sources (CASCADE)
   - addressesSchema.js — with source_id FK to sources (CASCADE)
   - interCompaniesSchema.js
   - All per PRD §3.3 field definitions, with proper constraints, indexes, and FK onDelete behavior

2. Models (in Modules/core/models/):
   - Sources.js, Vendors.js, Clients.js, Employees.js, Contacts.js, Addresses.js, InterCompanies.js
   - All extend TableModel
   - Vendors: custom findByCode(tenantId, code) method
   - Clients: custom findByCode(tenantId, code) method

3. Controllers (in Modules/core/controllers/):
   - vendorsController.js — on create, auto-creates a sources record (source_type='vendor') and links it
   - clientsController.js — same pattern with source_type='client'
   - employeesController.js — same pattern with source_type='employee'
   - contactsController.js, addressesController.js — standard CRUD linked via source_id
   - interCompaniesController.js — standard CRUD

4. Routes (in Modules/core/apiRoutes/v1/):
   - vendorsRouter.js → /api/core/v1/vendors
   - clientsRouter.js → /api/core/v1/clients
   - employeesRouter.js → /api/core/v1/employees
   - contactsRouter.js → /api/core/v1/contacts
   - addressesRouter.js → /api/core/v1/addresses
   - interCompaniesRouter.js → /api/core/v1/inter-companies

5. Register core module in moduleRegistry.js

6. Add tenant migration (202502110010) for core tables — topological FK order:
   sources → vendors → clients → employees → contacts → addresses → inter_companies → roles → role_members → policies

7. Update tenant provisioning to include core tables in bootstrap()

8. Write tests:
   - tests/unit/: controller logic for source auto-creation
   - tests/integration/: full CRUD for each entity, cascade deletes via source_id, contacts/addresses linked to vendors/clients/employees
   - tests/contract/: API contracts for all core routes

Add copyright headers to all files per PRD §10.3.

Reference: /Users/ian/Code/nap/PRD.md
```

**Verify before next phase:**
- Create vendor → source record auto-created
- Add contacts/addresses to vendor via source_id → cascade delete works
- Same pattern works for clients and employees
- Excel import/export works for all entities
- All tests pass

---

## Phase 8 — Projects Module

```
Implement Phase 8: Projects Module per PRD §3.4.

Phases 1-7 are complete. Now build project management — projects, units, tasks, cost items, change orders, and templates:

1. Schemas (in Modules/projects/schemas/):
   - projectsSchema.js — includes contract_amount field (numeric 14,2) for profitability tracking, company_id FK to inter_companies, client_id FK to clients, address_id FK to addresses
   - unitsSchema.js — project_id FK (CASCADE), template_unit_id FK (SET NULL)
   - taskGroupsSchema.js — tenant-scope code library
   - tasksMasterSchema.js — master task library with task_group_code FK
   - tasksSchema.js — unit-level instances, unit_id FK (CASCADE), self-referential parent_task_id
   - costItemsSchema.js — task_id FK (CASCADE), generated amount column (quantity * unit_cost)
   - changeOrdersSchema.js — unit_id FK (CASCADE), status workflow
   - templateUnitsSchema.js — blueprint with version and status
   - templateTasksSchema.js — blueprint tasks with parent_code hierarchy
   - templateCostItemsSchema.js — blueprint costs with generated amount
   - templateChangeOrdersSchema.js

2. Models (in Modules/projects/models/) — all extending TableModel

3. Controllers (in Modules/projects/controllers/):
   - projectsController.js — CRUD with status transitions (planning → budgeting → released → complete)
   - unitsController.js — CRUD, template-based creation (copies template tasks and cost items)
   - tasksController.js, taskGroupsController.js, tasksMasterController.js
   - costItemsController.js — validates cost_class enum, cost_source enum
   - changeOrdersController.js — status workflow (draft → submitted → approved/rejected), approved COs adjust budget
   - Template controllers: standard CRUD

4. Routes (in Modules/projects/apiRoutes/v1/):
   - All endpoints per PRD §3.4: /api/projects/v1/projects, /units, /tasks, /task-groups, /tasks-master, /cost-items, /change-orders, /template-units, /template-tasks, /template-cost-items, /template-change-orders

5. Template-based project creation service:
   - Modules/projects/services/templateService.js
   - Given a template_unit_id, copies all template tasks and cost items into a new unit
   - Preserves task hierarchy (parent_code → parent_task_id resolution)
   - Records template_unit_id and version_used on the new unit

6. Register projects module in moduleRegistry.js

7. Add tenant migration (202502110020) for all project tables in FK dependency order

8. Write tests:
   - tests/unit/: template copy logic, status transition validation, change order amount calculation
   - tests/integration/: create project → add units → add tasks → add cost items → submit change order → approve → verify budget adjustment
   - tests/contract/: API contracts for all project routes

Add copyright headers to all files per PRD §10.3.

Reference: /Users/ian/Code/nap/PRD.md
```

**Verify before next phase:**
- Create project with all child entities
- Template-based unit creation copies tasks and cost items correctly
- Change order approval adjusts budget metrics
- Generated amount columns compute correctly
- Status transitions enforce valid workflows
- All tests pass

---

## Phase 9 — Activities & Cost Management

```
Implement Phase 9: Activities & Cost Management per PRD §3.5.

Phases 1-8 are complete. Now build the activity-based cost tracking module:

1. Schemas (in Modules/activities/schemas/):
   - categoriesSchema.js — cost categories with type enum (labor/material/subcontract/equipment/other)
   - activitiesSchema.js — category_id FK (CASCADE)
   - deliverablesSchema.js — status workflow (pending → released → finished → canceled)
   - deliverableAssignmentsSchema.js — composite: deliverable_id + project_id FKs (CASCADE)
   - budgetsSchema.js — deliverable_id + activity_id FKs, version tracking, approval workflow (draft → submitted → approved → locked → rejected)
   - costLinesSchema.js — company_id (RESTRICT), deliverable_id (CASCADE), vendor_id, activity_id (CASCADE), budget_id (SET NULL), generated amount (quantity * unit_price), markup_pct
   - actualCostsSchema.js — activity_id FK (CASCADE), project_id FK (SET NULL) for profitability tracking, approval workflow
   - vendorPartsSchema.js — vendor_id FK (CASCADE)

2. Models (in Modules/activities/models/) — all extending TableModel

3. Controllers (in Modules/activities/controllers/):
   - categoriesController.js, activitiesController.js — standard CRUD
   - deliverablesController.js — status workflow enforcement
   - deliverableAssignmentsController.js — validates project and employee references
   - budgetsController.js:
     - Version management: approved budgets become read-only, new changes spawn new version
     - Approval workflow with submitted_by/at, approved_by/at audit
     - Budget must be approved before deliverable can be released
   - costLinesController.js — validates against approved budget, status transitions
   - actualCostsController.js:
     - Validates: deliverable must be released, cost line must exist and be approved
     - Amount cannot exceed budget + tolerance unless covered by change orders
     - Approval triggers GL posting hook (placeholder — wired in Phase 13)
   - vendorPartsController.js — standard CRUD

4. Routes (in Modules/activities/apiRoutes/v1/):
   - /api/activities/v1/categories, /activities, /deliverables, /deliverable-assignments, /budgets, /cost-lines, /actual-costs, /vendor-parts
   - Also: /api/activities/v1/projects (project list from activities perspective)

5. Register activities module in moduleRegistry.js

6. Add tenant migration (202502110040) for all activity tables

7. Write tests:
   - tests/unit/: budget version logic, actual cost validation rules, tolerance checks
   - tests/integration/: full flow — create category → activity → deliverable → assign to project → create budget → approve → add cost lines → record actual costs → verify remaining budget
   - tests/contract/: API contracts for all activity routes

Add copyright headers to all files per PRD §10.3.

Reference: /Users/ian/Code/nap/PRD.md
```

**Verify before next phase:**
- Budget approval workflow works (draft → submitted → approved)
- Approved budget becomes read-only, new version created for changes
- Actual cost validation enforces budget limits
- Cost line generated amounts compute correctly
- Deliverable cannot be released without approved budget
- All tests pass

---

## Phase 10 — Bill of Materials (BOM)

```
Implement Phase 10: Bill of Materials per PRD §3.6.

Phases 1-9 are complete. Now build the BOM module with AI-powered SKU matching:

1. Schemas (in Modules/bom/schemas/):
   - catalogSkusSchema.js — includes vector(3072) embedding column for pgvector, description_normalized
   - vendorSkusSchema.js — vendor_id FK (RESTRICT), catalog_sku_id FK (SET NULL), confidence float, vector(3072) embedding
   - vendorPricingSchema.js — vendor_sku_id FK (CASCADE), effective_date for time-based pricing

2. Models (in Modules/bom/models/):
   - CatalogSkus.js — extends TableModel
   - VendorSkus.js — extends TableModel with custom methods:
     - findBySku(vendorId, vendorSku): lookup by composite key
     - getUnmatched(): find vendor SKUs without catalog_sku_id
     - refreshEmbeddings(batches): batch update embedding vectors
   - VendorPricing.js — extends TableModel

3. Embedding service:
   - Modules/bom/services/embeddingService.js
   - Uses OpenAI API (text-embedding-3-large model, 3072 dimensions)
   - generateEmbedding(text): returns Float32Array
   - batchGenerateEmbeddings(texts[]): batch processing with rate limiting
   - normalizeDescription(text): clean and normalize SKU descriptions for matching

4. SKU matching service:
   - Modules/bom/services/matchingService.js
   - findSimilarCatalogSkus(vendorSkuId, topK=5): uses pgvector cosine similarity search
   - autoMatch(vendorSkuId, confidenceThreshold=0.85): auto-assigns catalog_sku_id if confidence exceeds threshold
   - batchMatch(vendorSkuIds[]): process multiple vendor SKUs

5. Controllers (in Modules/bom/controllers/):
   - catalogSkusController.js — CRUD + endpoint to trigger embedding refresh
   - vendorSkusController.js — CRUD + match endpoints + unmatched listing
   - vendorPricingController.js — standard CRUD

6. Routes (in Modules/bom/apiRoutes/v1/):
   - /api/bom/v1/catalog-skus
   - /api/bom/v1/vendor-skus (includes GET /unmatched, POST /match, POST /batch-match)
   - /api/bom/v1/vendor-pricing

7. Register BOM module in moduleRegistry.js

8. Add tenant migration (202502110030) — creates tables with pgvector extension enabled

9. Match review logs (PRD §3.12):
   - Wire match decisions to admin.match_review_logs for audit trail

10. Write tests:
    - tests/unit/: description normalization, embedding service (mock OpenAI), matching logic
    - tests/integration/: create catalog SKU → create vendor SKU → generate embeddings → match → verify confidence score and catalog link
    - tests/contract/: API contracts for BOM routes

Add copyright headers to all files per PRD §10.3.

Reference: /Users/ian/Code/nap/PRD.md
```

**Verify before next phase:**
- Catalog SKU creation with embedding generation works
- Vendor SKU matching returns ranked results with confidence scores
- Auto-match assigns catalog_sku_id above threshold
- Match review logs capture decisions
- Vendor pricing with effective dates returns correct current price
- All tests pass

---

## Phase 11 — Accounts Payable (AP)

```
Implement Phase 11: Accounts Payable per PRD §3.7.

Phases 1-10 are complete. Now build the AP module — vendor invoices, lines, payments, and credit memos:

1. Schemas (in Modules/ap/schemas/):
   - apInvoicesSchema.js — company_id (RESTRICT), vendor_id (RESTRICT), project_id (SET NULL) for cashflow tracking, status workflow (open → approved → paid → voided)
   - apInvoiceLinesSchema.js — invoice_id (CASCADE), cost_line_id (SET NULL), activity_id (SET NULL), account_id (RESTRICT)
   - paymentsSchema.js — vendor_id (RESTRICT), ap_invoice_id (SET NULL), method enum (check/ach/wire)
   - apCreditMemosSchema.js — vendor_id (RESTRICT), ap_invoice_id (SET NULL), status workflow (open → applied → voided)

2. Models (in Modules/ap/models/) — all extending TableModel

3. Controllers (in Modules/ap/controllers/):
   - apInvoicesController.js:
     - Status workflow enforcement (open → approved → paid → voided)
     - Approval validation: every line must map to a valid GL account
     - On approval: create GL journal entry (debit Expense/WIP, credit AP Liability) — placeholder hook for Phase 13
     - project_id links invoice to project for cashflow tracking
   - apInvoiceLinesController.js — validates account_id exists in chart_of_accounts, optional cost_line_id link
   - paymentsController.js:
     - Records payment against AP invoice
     - On payment: update invoice status to 'paid', create GL entry (debit AP Liability, credit Cash/Bank) — placeholder hook
     - Partial payment support: track remaining balance
   - apCreditMemosController.js — apply credit against invoice, status management

4. Routes (in Modules/ap/apiRoutes/v1/):
   - /api/ap/v1/ap-invoices
   - /api/ap/v1/ap-invoice-lines
   - /api/ap/v1/payments
   - /api/ap/v1/ap-credit-memos

5. Register AP module in moduleRegistry.js

6. Add tenant migration (202502110050) for AP tables

7. Write tests:
   - tests/unit/: invoice approval validation, payment balance tracking, credit memo application
   - tests/integration/: full AP cycle — create invoice → add lines → approve → pay → verify status transitions and balance updates
   - tests/contract/: API contracts for all AP routes

Add copyright headers to all files per PRD §10.3.

Reference: /Users/ian/Code/nap/PRD.md
```

**Verify before next phase:**
- Create AP invoice with lines → approve → pay → status flow works
- Invoice lines validate GL account references
- Payment updates invoice status and tracks remaining balance
- Credit memos can be applied to invoices
- project_id is captured for cashflow tracking
- All tests pass

---

## Phase 12 — Accounts Receivable (AR)

```
Implement Phase 12: Accounts Receivable per PRD §3.8.

Phases 1-11 are complete. Now build the AR module — client invoices, lines, and receipts:

1. Schemas (in Modules/ar/schemas/):
   - arClientsSchema.js — extended client model with client_code, email, phone, tax_id, billing_address_id FK, physical_address_id FK, primary_contact_id FK
   - arInvoicesSchema.js — company_id (RESTRICT), client_id (RESTRICT), project_id (SET NULL) for revenue/cashflow tracking, deliverable_id (SET NULL), status workflow (open → sent → paid → voided)
   - arInvoiceLinesSchema.js — invoice_id (CASCADE), account_id (RESTRICT)
   - receiptsSchema.js — client_id (RESTRICT), ar_invoice_id (SET NULL), method enum (check/ach/wire)

2. Models (in Modules/ar/models/) — all extending TableModel
   - ArClients.js: custom findByCode(tenantId, clientCode)

3. Controllers (in Modules/ar/controllers/):
   - arClientsController.js — enriched CRUD with address and contact linking
   - arInvoicesController.js:
     - Status workflow (open → sent → paid → voided)
     - On posting: create GL journal entry (debit AR, credit Revenue) — placeholder hook for Phase 13
     - project_id links invoice to project for profitability tracking
     - Revenue recognition notes per PRD: can depend on activity completion % or cost thresholds
   - arInvoiceLinesController.js — validates account_id exists in chart_of_accounts
   - receiptsController.js:
     - Records receipt against AR invoice
     - On receipt: update invoice status to 'paid', create GL entry (debit Cash/Bank, credit AR) — placeholder hook
     - Partial payment support: track remaining balance

4. Routes (in Modules/ar/apiRoutes/v1/):
   - /api/ar/v1/clients
   - /api/ar/v1/ar-invoices
   - /api/ar/v1/ar-invoice-lines
   - /api/ar/v1/receipts

5. Register AR module in moduleRegistry.js

6. Add tenant migration (202502110060) for AR tables

7. Apply RBAC per-route enforcement to AR invoices router per PRD §3.1.2:
   - withMeta({ module: 'ar', router: 'invoices', action: 'approve' }) on approval endpoint
   - This enables the policy ar::invoices::approve to restrict approval rights

8. Write tests:
   - tests/unit/: invoice status transitions, receipt balance tracking
   - tests/integration/: full AR cycle — create client → create invoice → add lines → send → receive payment → verify status and balance
   - tests/rbac/: ar::invoices::approve permission enforcement
   - tests/contract/: API contracts for all AR routes

Add copyright headers to all files per PRD §10.3.

Reference: /Users/ian/Code/nap/PRD.md
```

**Verify before next phase:**
- Create AR invoice with lines → send → receive payment → status flow works
- AR client includes linked addresses and contacts
- RBAC enforces ar::invoices::approve permission
- project_id is captured for revenue/profitability tracking
- Receipts track partial payment balances
- All tests pass

---

## Phase 13 — Accounting & General Ledger

```
Implement Phase 13: Accounting & General Ledger per PRD §3.9.

Phases 1-12 are complete. Now build the GL module and wire up all the posting hooks from AP, AR, and actual costs:

1. Schemas (in Modules/accounting/schemas/):
   - chartOfAccountsSchema.js — type enum (asset/liability/equity/income/expense/cash/bank), bank fields for cash/bank types
   - journalEntriesSchema.js — company_id (RESTRICT), project_id (SET NULL) for project-level GL, status workflow (pending → posted → reversed), source_type, source_id, self-referential corrects_id (SET NULL)
   - journalEntryLinesSchema.js — entry_id (CASCADE), account_id (RESTRICT), debit/credit with defaults, polymorphic related_table/related_id
   - ledgerBalancesSchema.js — account_id (RESTRICT), as_of_date, balance
   - postingQueuesSchema.js — journal_entry_id (CASCADE), status (pending → posted → failed), error_message
   - categoryAccountMapSchema.js — category_id (RESTRICT), account_id (RESTRICT), valid_from/valid_to date range
   - interCompanyAccountsSchema.js — source_company_id + target_company_id FKs (RESTRICT), unique constraint
   - interCompanyTransactionsSchema.js — paired journal entry references, module enum (ar/ap/je)
   - internalTransfersSchema.js — from_account_id + to_account_id FKs

2. Models (in Modules/accounting/models/) — all extending TableModel

3. Posting service:
   - Modules/accounting/services/postingService.js
   - createJournalEntry(data): validates debits = credits, falls within open fiscal period
   - postEntry(entryId): moves to posted, updates ledger balances, processes through posting queue
   - reverseEntry(entryId): creates a correcting entry linked via corrects_id
   - postAPInvoice(invoiceId): debit Expense/WIP, credit AP Liability — wire into AP controller
   - postAPPayment(paymentId): debit AP Liability, credit Cash/Bank — wire into AP controller
   - postARInvoice(invoiceId): debit AR, credit Revenue — wire into AR controller
   - postARReceipt(receiptId): debit Cash/Bank, credit AR — wire into AR controller
   - postActualCost(actualCostId): debit Expense/WIP, credit AP/Accrual — wire into activities controller
   - All posting operations use pg-promise db.tx() for transactional atomicity

4. Intercompany service:
   - Modules/accounting/services/intercompanyService.js
   - createIntercompanyTransaction(): creates paired journal entries (due-to/due-from)
   - Elimination flags for consolidated reporting

5. Controllers (in Modules/accounting/controllers/):
   - chartOfAccountsController.js — standard CRUD
   - journalEntriesController.js — create, post, reverse, list
   - journalEntryLinesController.js — validates balance on create/update
   - ledgerBalancesController.js — read-only queries
   - postingQueuesController.js — list, retry failed
   - categoryAccountMapController.js — date-range validation
   - interCompanyAccountsController.js, interCompanyTransactionsController.js, internalTransfersController.js

6. Routes (in Modules/accounting/apiRoutes/v1/):
   - All endpoints per PRD §3.9: /api/accounting/v1/chart-of-accounts, /journal-entries, /journal-entry-lines, /ledger-balances, /posting-queues, /categories-account-map, /inter-company-accounts, /inter-company-transactions, /internal-transfers

7. Wire posting hooks into AP, AR, and activities controllers:
   - Go back to Phase 11 (AP) controllers: replace placeholder hooks with actual postingService calls
   - Go back to Phase 12 (AR) controllers: same
   - Go back to Phase 9 (activities) actualCostsController: wire approval → postActualCost

8. Register accounting module in moduleRegistry.js

9. Add tenant migration (202502110070) for all accounting tables

10. Write tests:
    - tests/unit/: balance validation, posting logic, reversal chain, category-account map date range
    - tests/integration/: full cycle — AP invoice → approve → GL entry created → pay → GL entry created → verify ledger balances. Same for AR. Intercompany transaction creates paired entries.
    - tests/contract/: API contracts for all accounting routes

Add copyright headers to all files per PRD §10.3.

Reference: /Users/ian/Code/nap/PRD.md
```

**Verify before next phase:**
- Manual journal entry balances (debits = credits)
- AP invoice approval → GL entry auto-created
- AP payment → GL entry auto-created
- AR invoice posting → GL entry auto-created
- AR receipt → GL entry auto-created
- Actual cost approval → GL entry auto-created
- Ledger balances update correctly
- Reversal creates correcting entry
- Intercompany transactions create paired entries
- All tests pass

---

## Phase 14 — Cashflow & Profitability

```
Implement Phase 14: Cashflow & Profitability per PRD §3.10 and §3.11.

Phases 1-13 are complete — all transactional modules are working with GL posting. Now build the reporting views and API:

1. SQL views (tenant-scope, created via migration 202502120080):

   a. vw_project_profitability — per PRD §3.10.4:
      - Joins: projects, ar_invoices, receipts, ap_invoices, payments, actual_costs, cost_items
      - Columns: project_id, project_code, project_name, contract_amount, invoiced_revenue, collected_revenue, outstanding_ar, total_budgeted_cost, committed_cost, actual_spend, cash_out, gross_profit, gross_margin_pct, net_cashflow, budget_variance, est_cost_at_completion, projected_profit, projected_margin_pct

   b. vw_project_cashflow_monthly — per PRD §3.10.3:
      - Monthly time series per project
      - Columns: project_id, month, inflow (receipts), outflow (payments + actuals), net_cashflow, cumulative_inflow, cumulative_outflow, cumulative_net

   c. vw_project_cost_by_category — per PRD §3.10.4:
      - Cost breakdown by activity category per project
      - Columns: project_id, category_code, category_name, category_type, budgeted_amount, committed_amount, actual_amount, variance

   d. vw_ar_aging — per PRD §3.10.4:
      - AR aging buckets per client and project
      - Columns: client_id, project_id, current_amount, days_30, days_60, days_90, days_90_plus, total_outstanding
      - Buckets calculated from: invoice_date vs NOW() for open/sent invoices

   e. vw_ap_aging — per PRD §3.10.4:
      - AP aging buckets per vendor and project
      - Same bucket structure as AR aging

   f. Existing export views (PRD §3.11):
      - vw_export_contacts, vw_export_addresses, vw_export_template_cost_items, vw_template_tasks_export

2. Report models (in Modules/reports/models/):
   - ProjectProfitability.js — extends QueryModel (read-only), backed by vw_project_profitability
   - ProjectCashflowMonthly.js — extends QueryModel, backed by vw_project_cashflow_monthly
   - ProjectCostByCategory.js — extends QueryModel
   - ArAging.js, ApAging.js — extend QueryModel

3. Report controllers (in Modules/reports/controllers/):
   - profitabilityController.js — list all projects, detail for single project
   - cashflowController.js — monthly time series, forecast endpoint (uses AR due dates + AP obligations)
   - costBreakdownController.js — category-level budget vs actual
   - agingController.js — AR aging (all clients or by client), AP aging (all vendors or by vendor)
   - companyController.js — aggregated cashflow across all projects for a company
   - marginController.js — cross-project margin comparison and trending

4. Routes (in Modules/reports/apiRoutes/v1/):
   - All 11 endpoints per PRD §3.10.5:
   - GET /api/reports/v1/project-profitability
   - GET /api/reports/v1/project-profitability/:projectId
   - GET /api/reports/v1/project-cashflow/:projectId
   - GET /api/reports/v1/project-cashflow/:projectId/forecast
   - GET /api/reports/v1/project-cost-breakdown/:projectId
   - GET /api/reports/v1/ar-aging, /ar-aging/:clientId
   - GET /api/reports/v1/ap-aging, /ap-aging/:vendorId
   - GET /api/reports/v1/company-cashflow
   - GET /api/reports/v1/margin-analysis

5. Views module for export views:
   - Modules/views/ — routes for export view queries

6. Register reports and views modules in moduleRegistry.js

7. Seed test data:
   - Create a comprehensive seed script that generates realistic test data across all modules
   - Multiple projects with varying profitability
   - AR invoices (some paid, some outstanding at various ages)
   - AP invoices (some paid, some outstanding)
   - Actual costs across categories
   - This data will also be used for Phase 15 UI verification

8. Write tests:
   - tests/integration/: seed data → query each view → verify calculated metrics match expected values
   - Verify: profitability = invoiced revenue - committed cost, margin % correct, aging buckets correct, cashflow timeline sums match
   - tests/contract/: API contracts for all report routes

Add copyright headers to all files per PRD §10.3.

Reference: /Users/ian/Code/nap/PRD.md
```

**Verify before next phase:**
- All SQL views return correct data
- Profitability metrics match manual calculations against seeded data
- Cashflow monthly time series shows correct inflows/outflows
- AR/AP aging buckets are accurate
- Forecast endpoint returns upcoming expected inflows/outflows
- Company-level cashflow aggregates across projects
- All tests pass

---

## Phase 15 — Reporting UI & Dashboards

```
Implement Phase 15: Reporting UI & Dashboards per PRD §3.10.6, §3.11, and remaining client pages.

Phases 1-14 are complete — all APIs and SQL views are working. Now build the frontend for all remaining modules:

1. API hooks for reports:
   - src/services/reportApi.js — all report endpoint functions
   - src/hooks/useReports.js — React Query hooks for each report endpoint with appropriate staleTime and caching

2. Dashboard page:
   - src/pages/Dashboard/DashboardPage.jsx
   - Company-level cashflow summary cards (total AR outstanding, total AP outstanding, net cashflow)
   - Quick links to top projects by profitability
   - Recent activity feed (latest invoices, payments, cost entries)

3. Project Profitability Dashboard (PRD §3.10.6):
   - src/pages/Reports/ProjectProfitabilityPage.jsx
   - Summary cards: Contract Value, Invoiced Revenue, Gross Profit, Gross Margin %, Net Cashflow
   - Status indicators: green (on budget), yellow (approaching), red (over budget)
   - MUI X Data Grid with all metrics from PRD §3.10.2
   - Sortable by any column, conditional formatting (red negative margins, green healthy)
   - Drill-down: click row → navigate to project detail profitability view
   - Export to Excel button (calls exportToSpreadsheet via API)

4. Cashflow Timeline Chart (PRD §3.10.6):
   - src/pages/Reports/ProjectCashflowPage.jsx
   - MUI X Charts: stacked area chart — monthly inflows vs outflows
   - Cumulative net cashflow trend line
   - Forecast region (dashed lines) for upcoming AR/AP due dates
   - Toggle buttons: Actual | Forecast | Combined view
   - Date range filter

5. Cost Breakdown Page:
   - src/pages/Reports/CostBreakdownPage.jsx
   - MUI X Charts: bar chart comparing budget vs committed vs actual per category
   - Data grid with category-level detail

6. AR/AP Aging Pages (PRD §3.10.6):
   - src/pages/Reports/ArAgingPage.jsx
   - src/pages/Reports/ApAgingPage.jsx
   - MUI X Data Grid with aging bucket columns: Current, 31-60, 61-90, 90+
   - Grouped by client (AR) or vendor (AP)
   - Filterable by project dropdown
   - Summary row with totals

7. Margin Analysis Page:
   - src/pages/Reports/MarginAnalysisPage.jsx
   - Cross-project margin comparison table
   - Trending chart showing margin over time

8. Placeholder CRUD pages for remaining modules (functional but basic):
   - src/pages/Core/VendorsPage.jsx, ClientsPage.jsx, EmployeesPage.jsx
   - src/pages/Projects/ProjectsPage.jsx, ProjectDetailPage.jsx
   - src/pages/Activities/CategoriesPage.jsx, DeliverablesPage.jsx, BudgetsPage.jsx
   - src/pages/AP/ApInvoicesPage.jsx, PaymentsPage.jsx
   - src/pages/AR/ArInvoicesPage.jsx, ReceiptsPage.jsx
   - src/pages/Accounting/ChartOfAccountsPage.jsx, JournalEntriesPage.jsx
   - Each page: MUI X Data Grid with data fetching via React Query, Module Bar toolbar with CRUD actions, create/edit dialog

9. Update routing in App.jsx:
   - Wire all new pages into the route structure per PRD §7
   - Ensure navigation config matches all routes

10. Update Sidebar navigation to highlight active routes correctly for all new pages

Add copyright headers to all files per PRD §10.3.

Reference: /Users/ian/Code/nap/PRD.md

After implementation, verify against seeded data from Phase 14: profitability numbers display correctly, cashflow charts render, aging grids show correct buckets, all CRUD pages load and function.
```

**Verify — final acceptance:**
- Dashboard loads with company-level summary
- Profitability page shows all projects with correct metrics
- Cashflow chart renders monthly inflows/outflows with forecast
- AR/AP aging grids display correct buckets
- All CRUD pages load data and support create/edit/archive/restore
- Navigation works for all routes
- Theme toggle works across all pages
- Export to Excel works from data grids
- Full end-to-end flow: create project → budget → cost lines → AP invoice → pay → AR invoice → receive → verify profitability dashboard updates
