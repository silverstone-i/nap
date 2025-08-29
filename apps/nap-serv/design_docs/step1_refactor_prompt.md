# Implementation Prompt --- Step 1 (Refactor auth/admin from tenants → core)

## Objective

Move **all authentication + admin context** concerns out of
`modules/tenants` into `modules/core`, without changing external API
behavior (same URLs), and with zero cross-tenant joins. Keep ESM,
pg-schemata, and repo conventions.

## Scope (move/own in **core**)

-   Controllers: `auth.controller.js`, `admin.controller.js`
-   Routers: `auth.router.js`, `admin.router.js`
-   Middlewares: `auth/*`, `rbac/*`, `tenantContext/*` (anything that
    decodes JWT, sets tenant/schema, enforces roles)
-   Utilities used by the above (JWT, cookies, token revocation,
    password hashing)
-   Tests covering auth/admin and middleware

> Tenants module should only own tenant business ops
> (CRUD/archive/restore) and admin-exposed tenant listings after Step 3,
> not auth mechanics.

## File layout (target)

    apps/nap-serv/
      modules/
        core/
          apiRoutes/v1/
            auth.router.js
            admin.router.js
          controllers/
            auth.controller.js
            admin.controller.js
          middlewares/
            auth.js            // verifies access/refresh, sets req.auth
            tenantContext.js   // binds pg-schemata schema from token
            rbac.js            // role & permission checks
          utils/
            jwt.js             // sign/verify, rotate, revoke
            cookies.js
            crypto.js          // hash/compare
        tenants/
          apiRoutes/v1/
            tenants.router.js  // tenant CRUD/archive/restore only
          controllers/
            tenants.controller.js

## Routing rules (unchanged externals)

-   **Keep paths the same** (clients unaffected):
    -   `POST /api/v1/auth/login|logout|refresh|me` → now served by
        **core** router
    -   `POST /api/v1/admin/assume-tenant|exit-assumption` → **core**
    -   (Step 3 will add `/api/v1/admin/tenants*` and
        `/api/v1/admin/nap-users*` as read-only in core)
-   Tenants module keeps: `/api/v1/tenants/*` (CRUD/archive/restore)
    only.

## Middleware contract

-   `auth.js`: verify access token (15m) or refresh (7d, cookie); set
    `req.auth = { sub, tenant_code, schema, roles, assumed?, actor?, on_behalf_of? }`

-   `tenantContext.js`: derive effective tenant:

    ``` js
    const eff = req.auth?.assumed ? req.auth.on_behalf_of : req.auth?.tenant_code;
    req.ctx = { tenant_code: eff, schema: schemaFromTenant(eff), user_id: req.auth.sub, actor_user_id: req.auth.assumed ? req.auth.actor : req.auth.sub };
    pgSchemata.setSchema(req.ctx.schema);
    ```

-   `rbac.js(desiredRoleOrPerm)`: compares `req.auth.roles` against
    route metadata.

## Controller adjustments

-   **core/controllers/auth.controller.js**
    -   `login(email, password)` → issues access+refresh cookies,
        includes `{ tenant_code, schema, roles }`
    -   `refresh()` → rotate access, optionally refresh
    -   `logout()` → revoke tokens (blacklist)
    -   `me()` → returns principal + perms
-   **core/controllers/admin.controller.js**
    -   `assumeTenant(tenant_code, reason)` → short-TTL access token
        with `assumed=true, actor, on_behalf_of`
    -   `exitAssumption()` → clear assumption (issue normal token)

## Deprecation shim (temporary)

In `modules/tenants/apiRoutes/v1/{auth,admin}.router.js`, export **thin
proxies** that call the new core controllers and log a deprecation
warning. Remove these shims in Step 3 after clients are confirmed
migrated.

## Code changes checklist

-   Update imports in app router composition to mount **core** routers:

    ``` js
    app.use('/api/v1/auth', coreAuthRouter);
    app.use('/api/v1/admin', coreAdminRouter); // only assume/exit for Step 1
    app.use('/api/v1/tenants', tenantsRouter);
    ```

-   Replace any `req.user` references with `req.auth` and `req.ctx`.

-   Ensure `db` access always uses `req.ctx.schema` (no literals).

-   Remove auth helpers from tenants/utils; re-export from core if
    needed.

## Acceptance tests (Vitest)

-   **Auth flow**: login → me → refresh → logout (cookies set with
    `HttpOnly`, `Secure`, `SameSite=Lax`).
-   **Tenant context**: token with `tenant_code=FOO` binds
    `req.ctx.schema='foo'`.
-   **Assume**: superadmin calls assume ACME → response token has
    `assumed, actor, on_behalf_of`; requests run under ACME schema; exit
    clears assumption.
-   **RBAC**: route guarded by `rbac('Administrator')` denies
    non-admins.
-   **No regressions**: legacy `/api/v1/auth/*` and
    `/api/v1/admin/assume-tenant` paths still work (served by core);
    tenant business routes unaffected.

## Non-functional

-   ESLint + Prettier pass; Conventional Commit:
    `refactor(core): move auth/admin from tenants to core`
-   Env vars unchanged; add `TOKEN_BLACKLIST_TABLE` if needed.
-   Update README "Auth & Middleware" section to point to **core**.
