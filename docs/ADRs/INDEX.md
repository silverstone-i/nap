# Architecture decision records

Read [PRD 0000](../PRDs/0000-nap-platform-architecture.md) first for current
platform requirements. ADRs explain decisions and history; they do not replace
the current PRD.

| ADR                                                                                                                    | Status           | Scope                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| [0001 — API layering and module structure](0001-api-layering-and-module-structure.md)                                  | Accepted in part | Seven API layers, flat modules, and module shape remain accepted; database-scope clauses are superseded by ADR 0004 |
| [0002 — Technology stack](0002-technology-stack.md)                                                                    | Accepted         | Runtime, API, database, web, test, storage, and deployment technology choices                                       |
| [0003 — Web toolchain](0003-web-toolchain-vite-and-bundler-mode-typescript.md)                                         | Accepted         | Vite SPA and browser-specific TypeScript resolution                                                                 |
| [0004 — Central administration, tenant cells, and RLS isolation](0004-central-admin-cells-and-rls-tenant-isolation.md) | Accepted         | Database topology, tenant isolation, projections, migrations, and module database targets                           |

## Maintenance

- Never delete or silently rewrite the rationale of an accepted ADR.
- Mark supersession in this index and in the affected ADR metadata.
- An accepted ADR change is incomplete until every affected current PRD,
  structure document, and RULES file is updated in the same change.
- Ordinary package-version upgrades do not require an ADR unless they change a
  recorded technology choice or compatibility boundary.
