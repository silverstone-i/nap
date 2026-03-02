# Architecture Contract

This document codifies the architecture invariants enforced by CI
(`npm run arch:check`) and ESLint. Violations block PRs to `dev`
and `main`.

## 1. Module Registry Completeness

Every directory under `src/modules/` and `src/system/` that contains
a `schema/` or `schemas/` subdirectory **must** be registered in
`src/db/moduleRegistry.js` with `{ name, scope, repositories, migrations }`.

**Exempt:** `system/tenants` (uses admin schema tables from auth,
has no schema/migrations of its own).

**Enforced by:** `checkModuleRegistry.js` (CI gate)

## 2. Barrel Export Contract

Cross-module service imports **must** go through the module's
`services/index.js` barrel file. Intra-module imports use direct
paths.

Current barrels:

- `system/core/services/index.js` — `{ allocateNumber }`
- `modules/accounting/services/index.js` — `{ postAPInvoice, postAPPayment, postARInvoice, postARReceipt, postActualCost }`

**Exempt:** Files under `src/services/` (shared bootstrap code),
`src/lib/`, `src/middleware/`, `src/db/` — these are cross-cutting
infrastructure.

**Enforced by:** `checkBarrelExports.js` (CI gate),
`import/no-restricted-paths` ESLint zones (edit-time)

**Adding a new cross-module service:** Export it from the relevant
barrel `services/index.js`. If the module has no barrel yet, create
one following the pattern in ADR-0019.

## 3. Middleware Chain Integrity

All routes **must** include `moduleEntitlement` middleware:

- Routes created via `createRouter()` get it automatically
  (`ensureEntitlement()`)
- Hand-built routes and `extendRoutes` callbacks must include
  `moduleEntitlement` explicitly
- `/ping` health check routes are exempt

**Exempt modules:** `system/auth` (pre-authentication),
`system/tenants` (admin-only, gated by `requireNapsoftTenant`)

**Enforced by:** `checkMiddlewareChain.js` (CI gate)

## 4. Migration Naming Convention

Migration files **must** follow the pattern
`YYYYMMDDNNNN_descriptiveName.js` where `YYYYMMDDNNNN` is a
12-digit timestamp.

Rules:

- No duplicate timestamps across the entire codebase
- Timestamps within each module must be in non-decreasing order
- Each module's `schema/migrations/index.js` must import and
  re-export all migration files that exist on disk

**Enforced by:** `checkMigrationOrder.js` (CI gate)

## 5. Module Dependency Direction

Allowed cross-module dependencies (verified cycle-free):

```
ap  → accounting, core
ar  → accounting, core
projects → core
```

Prohibited directions:

- `accounting` must not import from `ap`, `ar`, `projects`,
  `activities`, `bom`, or `reports`
- `core` must not import from any feature module
- No circular dependency chains at module level

**Enforced by:** `checkCircularDeps.js` (CI gate)

## Enforcement Summary

| Invariant | CI gate | ESLint | Pre-commit |
|-----------|---------|--------|------------|
| Module registry | `checkModuleRegistry` | — | — |
| Barrel exports | `checkBarrelExports` | `import/no-restricted-paths` | lint-staged |
| Middleware chain | `checkMiddlewareChain` | — | — |
| Migration naming | `checkMigrationOrder` | — | — |
| Circular deps | `checkCircularDeps` | — | — |

## References

- ADR-0018: Module Entitlement Middleware
- ADR-0019: Cross-Module Posting Contract via Barrel Exports
- ADR-0020: Reports Module Architecture
- ADR-0021: Architecture Invariant CI Gates
- ADR-0022: ESLint Module Boundary Rules
