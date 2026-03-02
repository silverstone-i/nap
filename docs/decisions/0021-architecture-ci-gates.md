# ADR-0021: Architecture Invariant CI Gates

**Status**: Accepted
**Date**: 2025-03-01

## Context

Architecture boundaries in the NAP monorepo (barrel exports, module registry, middleware chains, migration naming) were enforced only by convention. No CI pipeline existed — all checks were local (Husky pre-commit blocking mixed client/server commits). This meant violations could reach `dev` or `main` undetected.

## Decision

### Static analysis scripts as deterministic gates

Five architecture invariant checks run via `npm run arch:check` (exit 1 on any violation):

| Check | Invariant |
|-------|-----------|
| Module Registry | Every module/system directory with schemas is registered in `moduleRegistry.js` |
| Barrel Exports | Cross-module imports go through `services/index.js` barrels (ADR-0019) |
| Circular Dependencies | No circular dependency chains at module level |
| Middleware Chain | All routers include `moduleEntitlement` (ADR-0018) |
| Migration Ordering | Filenames follow `YYYYMMDDNNNN_` convention, no duplicate timestamps |

Scripts live at `scripts/arch/`, use only Node built-ins (no AST parser, no new dependencies), and produce JSON + Markdown artifacts uploaded as GitHub Actions workflow artifacts.

### GitHub Actions CI workflow

A single `ci.yml` workflow triggers on PRs to `dev` and `main` with two jobs:

- **lint** — `npm run lint` on all PRs
- **arch-check** — `npm run arch:check` on all PRs, uploads architecture report artifact

### Local test gate (pre-push hook)

Tests run locally against `nap_test` via a Husky `pre-push` hook. The full Vitest suite must pass before `git push` succeeds. This avoids the complexity of provisioning PostgreSQL + Redis service containers in CI while still guaranteeing tests are green before any PR is created.

### Branch protection rules (manual configuration)

| Branch | Required checks |
|--------|----------------|
| `dev` | lint, arch-check |
| `main` | lint, arch-check |

### Artifacts are CI-only

Architecture reports (`report.json`, `report.md`, `dependency-graph.json`) are generated fresh in CI and uploaded as downloadable workflow artifacts. They are not committed to the repo — `docs/architecture/` is gitignored. This avoids merge conflicts on report files while still making reports accessible per-PR.

## Consequences

- PRs that violate architecture invariants are blocked before merge
- Architecture reports are downloadable on every PR for visibility
- Deterministic checks are hard gates; AI interpretation (ADR TBD) is advisory only
- Adding a new module requires updating `moduleRegistry.js` or CI will fail
- Adding a new cross-module import requires going through a barrel export or CI will fail
- Tests are enforced locally via pre-push hook against the developer's `nap_test` database — `git push` is blocked until all tests pass
