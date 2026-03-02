# ADR-0020: Reports Module Architecture

**Status**: Accepted
**Date**: 2025-03-01

## Context

The reports module provides read-only analytics endpoints (profitability, cashflow, cost breakdown, AR/AP aging, margin analysis). These endpoints return data from SQL views and aggregation queries — they do not perform CRUD operations on a single model.

The standard module pattern (`createRouter` + `BaseController`) is designed around single-model CRUD: one schema, one controller, 13 standard routes. Reports don't fit this mold because they aggregate across multiple tables and have no create/update/delete lifecycle.

## Decision

### Reports opts out of `createRouter` and `BaseController`

The reports router (`modules/reports/apiRoutes/v1/reportsRouter.js`) uses hand-built `router.get()` calls instead of `createRouter`. Each route maps to a specific controller method (e.g., `profitabilityController.getAll`, `cashflowController.getForecast`).

### Explicit middleware on every route

Since reports doesn't use `createRouter` (which auto-injects `moduleEntitlement`), each GET endpoint explicitly includes the middleware chain:

```js
router.get('/project-profitability', meta, moduleEntitlement, (req, res) =>
  profitabilityController.getAll(req, res),
);
```

The `meta` middleware (`withMeta({ module: 'reports', router: 'reports' })`) annotates `req.resource` so `moduleEntitlement` can check tenant entitlement, and `rbac` (if added later) can enforce per-user read permissions.

### Controller inheritance

Report controllers extend `ReportController` (a thin subclass of `ViewController`), which itself extends `BaseController`. This provides access to the DB layer and schema resolution while disabling mutation methods. Each report controller implements focused query methods rather than generic CRUD.

### GET-only pattern

All report endpoints are GET requests. The `/ping` health check is included (no middleware) for consistency with other modules.

## Consequences

- **Clear separation**: Reports are recognized as a distinct pattern, not a special case of CRUD
- **No dead routes**: Standard CRUD routes (POST, PUT, DELETE, PATCH) are never registered
- **Explicit middleware**: Each route's middleware chain is visible in the router file — no hidden auto-injection
- **Maintenance cost**: New report endpoints must manually include `meta, moduleEntitlement` — but this is preferable to generating 13 unused CRUD routes
- **Extensible**: Additional report controllers can be added with their own GET endpoints following the same pattern
