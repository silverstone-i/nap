# NAP project structure

**Status:** Accepted

**Date:** 2026-08-19

**Requirements:** [PRD 0000 — NAP Platform Architecture](../PRDs/0000-nap-platform-architecture.md)

**Decisions:** [ADR 0001](../ADRs/0001-api-layering-and-module-structure.md),
[ADR 0002](../ADRs/0002-technology-stack.md),
[ADR 0003](../ADRs/0003-web-toolchain-vite-and-bundler-mode-typescript.md),
[ADR 0004](../ADRs/0004-central-admin-cells-and-rls-tenant-isolation.md)

## Purpose

This document is the structural source of truth for the NAP repository. It
defines folders, import layers, module ownership, and how the same source tree
maps to web, API, cell, worker, dedicated, and self-hosted deployments.

It does not define platform behavior; PRD 0000 owns that. It does not explain
why architecture decisions were selected; ADRs own that. It does not define
build order; the development roadmap owns sequencing.

## Requirement-to-structure map

| Requirements                                  | Structural response                                                                                   |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `ARCH-001`–`ARCH-003`                         | Independently buildable `apps/web` and `apps/api` workspaces in one monorepo                          |
| `ARCH-004`–`ARCH-010`, `ARCH-024`             | Separate `db/admin` and `db/cell` composition roots; no code tree per physical cell                   |
| `ARCH-013`–`ARCH-021`, `ARCH-033`, `ARCH-037` | One cell module set, one tenant transaction helper, isolation-test suite, module-owned RLS migrations |
| `ARCH-025`–`ARCH-027`                         | Separate migration entry points and versioned routers inside each module                              |
| `ARCH-030`, `ARCH-031`                        | Provider adapters remain behind API services; a worker workspace is added only when approved          |
| `ARCH-034`, `ARCH-035`, `ARCH-038`            | Managed, dedicated, and self-hosted deployments reuse the same applications and module registries     |

## Repository skeleton

```text
nap/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── util/
│   │   │   ├── db/
│   │   │   │   ├── admin/
│   │   │   │   │   ├── createAdminDb.ts
│   │   │   │   │   ├── moduleRegistry.ts
│   │   │   │   │   └── migrateAdmin.ts
│   │   │   │   ├── cell/
│   │   │   │   │   ├── createCellDb.ts
│   │   │   │   │   ├── moduleRegistry.ts
│   │   │   │   │   ├── migrateCell.ts
│   │   │   │   │   └── withTenantTransaction.ts
│   │   │   │   └── index.ts
│   │   │   ├── services/
│   │   │   ├── middleware/
│   │   │   ├── framework/
│   │   │   ├── modules/
│   │   │   │   └── <feature>/
│   │   │   │       ├── apiRoutes/v1/
│   │   │   │       ├── controllers/
│   │   │   │       ├── models/
│   │   │   │       ├── domain/
│   │   │   │       ├── schema/migrations/
│   │   │   │       ├── <feature>Repositories.ts
│   │   │   │       ├── descriptor.ts
│   │   │   │       └── index.ts
│   │   │   ├── scripts/
│   │   │   ├── app.ts
│   │   │   └── server.ts
│   │   ├── tests/
│   │   │   ├── unit/
│   │   │   ├── integration/
│   │   │   ├── isolation/
│   │   │   └── fixtures/
│   │   ├── .env.example
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsconfig.build.json
│   │   └── vitest.config.ts
│   └── web/
│       ├── src/
│       │   ├── api/
│       │   ├── auth/
│       │   ├── shell/
│       │   ├── pages/
│       │   ├── theme/
│       │   ├── mocks/
│       │   ├── components/
│       │   ├── App.tsx
│       │   └── main.tsx
│       ├── tests/
│       ├── index.html
│       ├── package.json
│       ├── tsconfig.json
│       └── vite.config.ts
├── packages/
│   └── shared/
│       ├── src/
│       ├── package.json
│       └── tsconfig.json
├── docs/
│   ├── README.md
│   ├── PRDs/
│   │   └── 0000-nap-platform-architecture.md
│   ├── architecture/
│   │   └── PROJECT-STRUCTURE.md
│   ├── ADRs/
│   │   ├── INDEX.md
│   │   ├── 0001-api-layering-and-module-structure.md
│   │   ├── 0002-technology-stack.md
│   │   ├── 0003-web-toolchain-vite-and-bundler-mode-typescript.md
│   │   └── 0004-central-admin-cells-and-rls-tenant-isolation.md
│   ├── RULES/
│   ├── roadmaps/
│   │   └── DEVELOPMENT-ROADMAP.md
│   ├── reference/
│   │   └── NAP-Initial-Table-Schema.md
│   └── branding/
├── scripts/
│   ├── bootstrap-labels.sh
│   └── check-licenses.mjs
├── .github/
├── .husky/
├── .vscode/
├── package.json
├── tsconfig.base.json
├── eslint.config.mjs
├── .prettierrc
├── .licenses-allowed.json
├── .nvmrc
├── CLAUDE.md
├── COLLABORATION.md
├── CHANGELOG.md
└── README.md
```

The tree is a placement contract, not an instruction to create empty folders.
A business-module directory is created with its first accepted component PRD
and vertical slice.

## API import layers

ADR 0001 owns the layer decision. ADR 0004 supersedes only its former
tenant-schema scope.

| Layer         | May import               | Contents                                                                                                     |
| ------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `util/`       | nothing                  | Pure helpers, logging adapters, cookies, hashing, identifiers                                                |
| `db/`         | `util`                   | Database composition roots, migration registries, tenant transaction helper, optional Redis client           |
| `services/`   | `db`, `util`             | Cross-module orchestration such as routing, provisioning, projection synchronization, and cache invalidation |
| `middleware/` | `services`, `db`, `util` | Authentication, tenant selection, entitlement, RBAC, resource scope, error handling                          |
| `framework/`  | lower layers             | Generic controller and router infrastructure                                                                 |
| `modules/`    | lower layers             | Feature routers, controllers, models, repositories, migrations, and domain behavior                          |
| `scripts/`    | any layer as needed      | Maintenance and release operations outside the runtime import graph                                          |

Runtime code does not import from `scripts/`. A workflow spanning multiple
module owners belongs in `services/`, not in an arbitrary feature module.

## Database composition roots

`db/admin/` constructs the central database handle and assembles admin-targeted
module repositories and migrations. `db/cell/` constructs the one cell handle
available to a cell deployment and assembles cell-targeted repositories and
migrations.

`withTenantTransaction.ts` is the application entry point for tenant business
work. Its required implementation is defined once in
[RULES/database-access.md](../RULES/database-access.md).

The two migration runners are release commands, not server-start hooks.
Module-owned migrations enter exactly one registry according to the module
descriptor.

## Module shape

Modules are flat. `platform`, `identity`, and `tenants` use the same internal
shape as projects and accounting.

```text
modules/<feature>/
├── apiRoutes/v1/
├── controllers/
├── models/
├── domain/
├── schema/migrations/
├── <feature>Repositories.ts
├── descriptor.ts
└── index.ts
```

The descriptor is the structural declaration for a module:

| Field            | Meaning                                                   |
| ---------------- | --------------------------------------------------------- |
| `name`           | Stable module identifier                                  |
| `databaseTarget` | `admin`, `cell`, or `none`                                |
| `schema`         | `admin`, `cell`, `reference`, `app`, `reporting`, or none |
| `licensable`     | Whether request-time tenant entitlement gates its routers |
| `repositories`   | Constructors registered on the target database handle     |
| `migrations`     | Ordered migrations assembled into the target registry     |
| `routers`        | Statically registered API versions                        |

The module's internal dependency direction is:

```text
apiRoutes -> controllers -> domain -> models/repositories
```

Controllers translate HTTP. Domain code owns business behavior. Repositories
own persistence. Models define query/table behavior. Migrations own physical
schema. A module normally targets one database; cross-database provisioning is
a service coordinating separate module operations.

## Module ownership map

This table is the current structural assignment for the table groups proposed
by the schema reference. Component PRDs refine their owned group without moving
another module's ownership silently.

| Module                | Target/schema    | Owned capability group                                                                                     |
| --------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------- |
| `platform`            | `admin/admin`    | Cell registry, managed operations, impersonation audit                                                     |
| `tenants`             | `admin/admin`    | Tenant registry and authoritative cell assignment                                                          |
| `identity`            | `admin/admin`    | Portal identities and sessions                                                                             |
| `memberships`         | `admin/admin`    | User-to-tenant access bindings                                                                             |
| `cell-directory`      | `cell/cell`      | Tenant and membership enforcement projections                                                              |
| `reference-data`      | `cell/reference` | Country and policy catalogs                                                                                |
| `access-control`      | `cell/app`       | Roles, policies, state/field scope, approvals, numbering, preferences                                      |
| `parties`             | `cell/app`       | Sources, companies, vendors, clients, employees, contacts, contact methods, payment terms, tax identifiers |
| `projects`            | `cell/app`       | Projects, memberships, units, tasks, templates, cost items, change orders                                  |
| `cost-control`        | `cell/app`       | Activities, deliverables, budgets, cost lines, actual costs, vendor parts                                  |
| `accounting`          | `cell/app`       | Ledgers, accounts, journals, balances, periods, posting, intercompany activity                             |
| `accounts-payable`    | `cell/app`       | AP invoices, payments, allocations, credit memos                                                           |
| `accounts-receivable` | `cell/app`       | AR invoices, receipts, allocations, billing agreements                                                     |
| `reporting`           | `cell/reporting` | Tenant-safe reporting views                                                                                |
| `catalog`             | `cell/app`       | Catalog, BOM, vendor SKU/pricing, matching audit                                                           |

Authentication middleware consumes `identity`, `memberships`, `tenants`, and
`platform`; it does not become a second table owner.

## Web structure

ADR 0003 owns the Vite and TypeScript decisions. `RULES/web-shell.md` owns URL,
theme, mock-selector, drawer, and navigation conventions.

| Folder        | Ownership                                            |
| ------------- | ---------------------------------------------------- |
| `api/`        | HTTP transport and response adaptation               |
| `auth/`       | Login and authenticated-route behavior               |
| `shell/`      | Application frame and URL-derived scope              |
| `pages/`      | Routed page composition                              |
| `theme/`      | Tokens, MUI theme construction, and mode selection   |
| `mocks/`      | Selector-backed temporary data seam                  |
| `components/` | Reusable presentation without server business policy |

The first real web feature module requires a web-layering ADR. Until then, the
shell folders remain intentionally small.

## Shared package boundary

`packages/shared` contains only transport-safe types, enums, validation
primitives, and genuinely generic utilities. Server domain behavior remains in
the API.

`packages/contracts` is not part of the initial skeleton. Add it only through
an accepted decision after separately versioned transport contracts provide a
demonstrated benefit.

## Documentation placement

The purpose and authority of each documentation folder are defined in the
[documentation index](../README.md). This document owns only their physical
placement.

## How the skeleton supports growth

| Change                       | Structural effect                                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Add Cell 2                   | Deploy the existing API build with another cell configuration; create no source folder                                  |
| Add a tenant                 | Add records and seed data through provisioning; create no schema, migration tree, or code folder                        |
| Add a business module        | Add one flat API module, component PRDs, and registrations in the existing target registries                            |
| Add a worker                 | Add `apps/worker` only after approval; import API domain modules and database composition code rather than copying them |
| Add a dedicated managed cell | Reuse the API and migration artifacts with dedicated configuration                                                      |
| Add self-hosting             | Deploy the same web/API artifacts with local admin and cell databases                                                   |
| Add a client                 | Add a separate client workspace against the existing API boundary                                                       |

These growth paths implement `ARCH-038`: growth changes composition and
configuration without weakening identity, cell, or tenant boundaries.
