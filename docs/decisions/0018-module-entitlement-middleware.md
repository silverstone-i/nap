# ADR-0018: Module Entitlement Middleware

**Status**: Accepted
**Date**: 2025-03-01

## Context

Tenants have an `allowed_modules` column (JSON array) on their `admin.tenants` record that controls which feature modules they are licensed to use. A `moduleEntitlement` middleware existed but was never wired into any route, so the entitlement gate was effectively disabled — every tenant could reach every module endpoint regardless of their `allowed_modules` value.

We needed to activate module entitlement checks across all routes without requiring each router to remember to add the middleware manually.

## Decision

### Auto-injection via `createRouter`

`moduleEntitlement` is auto-injected into `createRouter`'s middleware chain, following the same pattern as `addAuditFields`. The helper `ensureEntitlement` appends `moduleEntitlement` to every method's middleware array if not already present:

```
[...userMiddlewares (incl. withMeta)] → moduleEntitlement → handler
```

For mutation routes, the full chain is:

```
addAuditFields → [...userMiddlewares] → moduleEntitlement → handler
```

This means no router using `createRouter` can forget entitlement checks — they are applied automatically.

### Middleware chain ordering

The intended runtime chain for authenticated requests is:

```
authRedis → withMeta → moduleEntitlement → rbac → handler
```

- `authRedis` populates `req.ctx.tenant` (with the effective tenant's record)
- `withMeta` annotates `req.resource` with `{ module, router, action }`
- `moduleEntitlement` reads `req.ctx.tenant.allowed_modules` and `req.resource.module`
- `rbac` checks per-user permission policies

### Non-breaking rollout

The middleware uses an "empty means allow all" semantic: if `allowed_modules` is null, undefined, or an empty array, all modules are permitted. This means existing tenants that have no `allowed_modules` configured are unaffected. Entitlement enforcement activates per-tenant as their `allowed_modules` arrays are populated.

### Reports module

The reports module uses hand-built routes (no `createRouter`), so `meta` and `moduleEntitlement` are applied explicitly to each GET endpoint. The `/ping` health check endpoint has no middleware — `moduleEntitlement` is a no-op without `req.resource` anyway.

## Consequences

- **All routers** (63 router files as of latest `arch:check`) have `withMeta` metadata and `moduleEntitlement` enforcement
- **Zero behavioral change** until `allowed_modules` is populated for a tenant
- Routers using `createRouter` get entitlement for free; custom routes must add it explicitly
- `req.ctx.tenant` must reflect the effective tenant (fixed in authRedis) for entitlement to check the correct `allowed_modules`
