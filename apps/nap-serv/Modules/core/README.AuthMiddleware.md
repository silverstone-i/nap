# Auth & Middleware (Core)

This module owns authentication and admin-context flows.

- Routers: /api/v1/auth/_ and /api/v1/admin/_
- Middlewares: modules/core/middlewares/{auth,tenantContext,rbac}.js
- Utils: modules/core/utils/{jwt,cookies,crypto}.js

Legacy tenants endpoints under /api/tenants/v1/{auth,admin} are thin shims that proxy to core and will be removed in a later step.
