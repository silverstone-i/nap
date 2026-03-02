# ADR-0022: ESLint Module Boundary Rules

**Status**: Accepted
**Date**: 2025-03-01

## Context

Architecture invariant checks (ADR-0021) run in CI, but developers don't get feedback until they push a PR. For the barrel export contract (ADR-0019), earlier feedback at edit-time and pre-commit improves the developer experience and catches violations before they reach CI.

## Decision

### `import/no-restricted-paths` zones in ESLint flat config

Two zones enforce barrel export boundaries at lint-time using the existing `eslint-plugin-import` (no new dependencies):

**Zone 1 — Accounting boundary:**
- Target: `modules/!(accounting)/**` (all feature modules except accounting itself)
- From: `modules/accounting`
- Except: `./services/index.js`

**Zone 2 — Core boundary:**
- Target: `modules/**` (all feature modules)
- From: `system/core`
- Except: `./services/index.js`

Intra-module imports are unrestricted. System-to-system imports (e.g., `system/tenants` from `system/core`) are unrestricted — these are platform code.

### lint-staged integration

`lint-staged` runs ESLint with `--fix` on staged files during pre-commit. The existing Husky hook already invokes lint-staged when present. Configuration in root `package.json`:

```json
"lint-staged": {
  "apps/nap-serv/**/*.js": ["eslint --fix"],
  "apps/nap-client/**/*.{js,jsx}": ["eslint --fix"]
}
```

### Why not `no-restricted-imports`?

ESLint's built-in `no-restricted-imports` uses minimatch patterns on the raw import specifier string but has no target/from scoping. When two config blocks define the same rule for the same file, the later one wins — making it impossible to compose per-module restrictions in flat config.

`import/no-restricted-paths` zones have built-in target/from scoping and an `except` mechanism, making them purpose-built for module boundary enforcement.

## Consequences

- Developers see boundary violations in their IDE (VS Code ESLint extension)
- Pre-commit catches violations via lint-staged before code is even committed
- CI `npm run lint` catches any remaining violations as a second gate
- Adding a new barrel requires adding a corresponding zone to `eslint.config.js`
- Zone configuration is co-located in a single config block, easy to extend
