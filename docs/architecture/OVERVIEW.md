# NAP architecture overview

The authoritative map of NAP's modules and the documents that govern
them. This file is a map only: requirements live in PRDs, decisions in
ADRs, implementation conventions in RULES docs. If a statement here
disagrees with one of those, this file is wrong.

NAP is a horizontal, project-native, multi-entity ERP on the PERN stack
([ADR-0002](../ADRs/0002-technology-stack.md)), with schema-per-tenant
isolation via pg-schemata. The core is industry-agnostic; the initial
release targets construction.

## Documentation model

A module is documented as a set of component PRDs — one PRD per
functional component, per [RULES/prd-format.md](../RULES/prd-format.md).
Doc modules and code modules differ: a doc module groups features as a
user sees them, while code modules
([ADR-0001](../ADRs/0001-api-layering-and-module-structure.md)) group
tables and routers by ownership. Each PRD names the owning code module
for everything it defines.

## Module map

| Module (docs)     | Component                  | Status  | Documents                                                                                                                                                                               |
| ----------------- | -------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth              | Authentication             | Planned | [ADR-0004](../ADRs/0004-portal-user-login-and-tenant-selection.md) (login and tenant selection); sessions/tokens PRD to come                                                            |
| Auth              | RBAC                       | Defined | [PRD 0003](../PRDs/0003-role-based-access-control.md); ADRs [0007](../ADRs/0007-rbac-self-contained-permission-cells.md)–[0012](../ADRs/0012-rbac-caching-and-staleness.md)             |
| Auth              | Platform administration    | Planned | NAP staff cross-tenant access and impersonation; PRD to come                                                                                                                            |
| Auth              | Licensing and entitlements | Planned | Per-tenant module entitlement and enforcement; PRD to come                                                                                                                              |
| Core              | Shared tables              | Partial | Entity/contact models exist in code (`apps/api/src/modules/core/`); RBAC tables per [ADR-0011](../ADRs/0011-rbac-schema.md)                                                             |
| Tenants           | Provisioning and migration | Defined | [PRD 0002](../PRDs/0002-schema-migration-and-tenant-provisioning.md); [ADR-0005](../ADRs/0005-module-registry-migrations-and-seeding.md)                                                |
| Web shell         | App shell and navigation   | Shipped | [PRD 0001](../PRDs/0001-web-app-shell-and-mock-walkthrough.md); [ADR-0003](../ADRs/0003-web-toolchain-vite-and-bundler-mode-typescript.md); [RULES/web-shell.md](../RULES/web-shell.md) |
| Projects, AP, AR… | Business modules           | Planned | Component PRDs to come as each is worked on                                                                                                                                             |

## Cross-cutting contracts

- API layering and module structure:
  [ADR-0001](../ADRs/0001-api-layering-and-module-structure.md)
- Standard resource routes:
  [ADR-0013](../ADRs/0013-standard-resource-routes.md) and
  [RULES/api-standard-routes.md](../RULES/api-standard-routes.md)
- Tests: [ADR-0006](../ADRs/0006-tests-live-under-tests.md)
- The full decision list: [ADRs/INDEX.md](../ADRs/INDEX.md)

[DESIGN.md](DESIGN.md) remains reference material only — one candidate
design, nothing in it decided, no document may cite it as authority.
This overview is the authoritative summary; DESIGN.md content that
proves out is absorbed into PRDs and ADRs over time.
