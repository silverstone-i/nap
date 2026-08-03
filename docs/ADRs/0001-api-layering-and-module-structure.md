# 0001 — API layering and module structure

- **Status:** Accepted
- **Date:** 2026-07-26

## Context

NAP runs one server process serving all tenants. Every module is loaded at boot
regardless of which tenant is calling, because a single process cannot load a
different module set per request.

Tenant-level module access is therefore an authorization concern at request
time, not a code-loading concern. Whether a tenant may use a module is decided
when the request arrives, against that tenant's entitlements. It is never
decided by which files got imported.

`apps/api` had no structure yet, so the import direction between directories
needed deciding before code landed.

## Decision — layer order

`src/` holds seven directories. A layer may import from layers below it, never
from layers above.

| Layer         | May import                    | Holds                                                       |
| ------------- | ----------------------------- | ----------------------------------------------------------- |
| `lib/`        | nothing                       | pure helpers — logger, cookies, hashing                     |
| `db/`         | lib                           | pg connection, redis client, module registry                |
| `services/`   | db, lib                       | permission loading, cache invalidation, tenant provisioning |
| `middleware/` | services, db, lib             | passport strategies, rbac, entitlement, error handler       |
| `framework/`  | middleware, services, db, lib | `ViewController`, `BaseController`, `createRouter`          |
| `modules/`    | framework and below           | feature modules                                             |
| `scripts/`    | —                             | maintenance only, outside the runtime import graph          |

`framework/` sits **above** `middleware/`, which is the non-obvious edge here.
`createRouter` composes middleware into the standard per-route chain, so the
router factory imports middleware rather than the other way around. That
dependency is also why `framework/` is not part of `lib/`: `lib/` is leaf code
that imports nothing from the app, and `createRouter` cannot meet that bar.

`scripts/` is listed for completeness. Nothing at runtime imports from it, and
it may reach into any layer it needs.

## Decision — modules are flat

`auth`, `core`, and `tenants` are modules like any other. There is no separate
`system/` tier.

Folder position no longer carries what makes one module different from another,
so two properties do:

- **Schema scope** — whether the module's tables live in the admin schema or in
  each tenant schema.
- **Licensable** — whether tenant-level entitlement gates access to the module.

These are independent. A module can be tenant-scoped and always-on, or
admin-scoped and licensable. Neither property implies the other, which is part
of why a single folder tier could not encode both.

## Decision — module internal shape

Every module has the same layout:

```
modules/<feature>/
├── apiRoutes/v1/
├── controllers/
├── models/
├── services/             # module-internal business logic
├── schema/migrations/
└── <feature>Repositories.js
```

API versioning is per-module. `apiRoutes/v1/` belongs to that module alone, so
modules version independently and one module going to `v2` forces nothing on
the others.

Migrations are module-owned rather than collected in a global directory. A
module that is never installed creates no tables.

## Consequences

Adding a module touches two hand-maintained places: `apiRoutes.js` and the
module registry in `db/`. This is deliberate — static imports stay analyzable,
and find-references keeps working. The coordination cost is real, though, and a
CI check that catches a module registered in one place but not the other is
worth adding later.

Enforcement is not part of this ADR. The layer order above is convention.
Nothing currently fails a build when an import points the wrong way. Lint rules
and CI gates are a separate decision.

`services/` means two different things depending on path. `src/services/` is
shared behavior that modules call. `modules/<feature>/services/` is business
logic internal to that one module. Same word, two scopes, disambiguated only by
where the file sits.

## Alternatives considered

**Separate `system/` and `modules/` tiers.** Rejected. The distinction the two
tiers encoded was schema scope and licensability, and both are better held as
data on a module descriptor than as folder position. As data they can be
queried, validated, and combined; as folders they can only be one or the other.

**Runtime service registry for cross-module calls.** Rejected. One process
serves all tenants, so every module is always loaded and deferred binding buys
nothing. Direct imports keep static analysis and find-references working, which
a registry lookup by string name would break.

**`framework/` merged into `lib/`.** Rejected. `lib/` is leaf helpers that
import nothing, while the router factory imports middleware. One folder holding
both makes the name misleading about what is safe to import from where.
