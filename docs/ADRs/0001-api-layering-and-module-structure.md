# 0001 — API layering and module structure

- **Status:** Accepted; database-scope clauses superseded by
  [ADR 0004](0004-central-admin-cells-and-rls-tenant-isolation.md)
- **Date:** 2026-07-26

## Context

NAP runs one server process serving all tenants. Every module is loaded at boot
regardless of which tenant is calling, because a single process cannot load a
different module set per request.

Tenant-level module access is therefore an authorization concern at request
time, not a code-loading concern. Whether a tenant may use a module is decided
when the request arrives, against that tenant's entitlements. It is never
decided by which files got imported.

This ADR defines the directory layout and import rules for `apps/api`.

## Decision — layer order

`src/` holds seven directories. The table defines the import hierarchy: each
layer may import only from the layers listed in its "May import" column.

| Layer         | May import                                | Holds                                                       |
| ------------- | ----------------------------------------- | ----------------------------------------------------------- |
| `util/`       | nothing                                   | pure helpers — logger, cookies, hashing                     |
| `db/`         | util                                      | pg connection, redis client, module registry                |
| `services/`   | db, util                                  | permission loading, cache invalidation, tenant provisioning |
| `middleware/` | services, db, util                        | passport strategies, rbac, entitlement, error handler       |
| `framework/`  | middleware, services, db, util            | `ReadController`, `WriteController`, `createRouter`         |
| `modules/`    | framework, middleware, services, db, util | feature modules                                             |
| `scripts/`    | —                                         | maintenance only, outside the runtime import graph          |

`scripts/` is listed for completeness. Nothing at runtime imports from it, and
it may reach into any layer it needs.

## Decision — modules are flat

`auth`, `core`, and `tenants` are modules like any other. There is no separate
`system/` tier.

> **Supersession note:** The original descriptor fields below are retained to
> preserve this ADR's decision history. ADR 0004 replaces them with
> `databaseTarget`, physical `schema`, and `licensable`; current code must use
> the replacement fields.

Each module's descriptor records two properties:

- **Schema scope** — tables live in the `admin` schema when every tenant shares
  them, otherwise in each tenant schema.
- **Licensable** — whether tenant-level entitlement gates the module. Used for
  industry-specific modules that not every tenant needs.

## Decision — module internal shape

Every module has the same layout:

```
modules/<feature>/
├── apiRoutes/v1/
├── controllers/
├── models/
├── domain/               # module-internal business logic
├── schema/migrations/
└── <feature>Repositories.js
```

API versioning is per-module. `apiRoutes/v1/` belongs to that module alone, so
modules version independently and one module going to `v2` forces nothing on
the others.

Migrations are module-owned rather than collected in a global directory. The
original decision allowed an uninstalled module to create no tables; ADR 0004
supersedes that physical-installation behavior. Current cell modules share the
cell migration target, and entitlement is enforced at request time.

## Consequences

Adding a module touches two hand-maintained places: `apiRoutes.js` and the
module registry in `db/`. This is deliberate — static imports stay analyzable,
and find-references keeps working. The coordination cost is real, though, and a
CI check that catches a module registered in one place but not the other is
worth adding later.

Enforcement is not part of this ADR. The layer order above is convention.
Nothing currently fails a build when an import points the wrong way. Lint rules
and CI gates are a separate decision.

## Alternatives considered

**Separate `system/` and `modules/` tiers.** Rejected. Descriptor metadata is
queryable and validatable, so a folder split adds nothing and hard-codes a
distinction the descriptor already carries. ADR 0004 later replaced the
original schema-scope fields without changing this conclusion.

**Runtime service registry for cross-module calls.** Rejected. One process
serves all tenants, so every module is always loaded and deferred binding buys
nothing. Direct imports keep static analysis and find-references working, which
a registry lookup by string name would break.
