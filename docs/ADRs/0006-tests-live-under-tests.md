# 0006 — Tests live under `tests/`, never beside source

- **Status:** Accepted
- **Date:** 2026-08-02 (corrected 2026-08-03: `tests/` at the workspace root,
  not `src/tests/`; amended 2026-08-05: test-type suffixes and vitest projects)

## Context

NAP does not use the common convention of colocating unit tests with the code
they test (`app.test.ts` beside `app.ts`). Test code and runtime code do not
share a folder: each workspace isolates all of its tests in a single `tests/`
folder at the workspace root.

## Decision

Each workspace keeps all of its tests under a top-level `tests/` directory
beside `src/`, mirroring the source tree beneath it.
`tests/db/connection.test.ts` tests `src/db/connection.ts`; a future
`tests/modules/auth/` tests `src/modules/auth/`. No `*.test.*` file ever sits
inside `src/`.

Within the mirror, the test _type_ is carried by the filename, not the
folder: unit tests are plain `foo.test.ts`; integration tests are
`foo.int.test.ts` (further types get suffixes the same way, e.g.
`foo.db.test.ts`). Each workspace's vitest config declares one project per
type in `test.projects`, keyed off those globs — unit includes
`tests/**/*.test.ts` and excludes `tests/**/*.int.test.ts`, integration
includes only the latter — so each type carries its own setup and is
selectable with `vitest --project unit` / `--project integration`, while a
bare `vitest` still runs everything.

- `apps/api`: vitest includes `tests/**/*.test.ts`. The emitting config
  (`tsconfig.build.json`) includes only `src`, so `dist/` stays pure runtime
  code with no exclusion needed; the workspace `tsconfig.json` (`noEmit`)
  covers `src` and `tests` so typecheck and typed linting see test files.
- `apps/web`: vitest includes `tests/**/*.test.{ts,tsx}`.

## Rationale

- Source directories contain only what ships. With tests outside `src/`, the
  emit boundary needs no exclusion at all — the build config's
  `include: ["src"]` is the whole contract.
- The test suite's shape is visible in one subtree instead of scattered
  through the source tree.
- Test-only helpers and fixtures get an obvious home (`tests/...`) without
  polluting runtime folders.

## Consequences

- Tests import their subjects by relative path out of `tests/`
  (`../../src/db/connection.js`). A moved source file means updating the
  mirrored test path too.
- The api typecheck (`tsc --noEmit`) covers `tests/` alongside `src/` through
  the workspace tsconfig; vitest is what executes those files.
- Workspace-relative tooling globs must account for two roots (`src/**` and
  `tests/**`) where both matter.
- Existing files predating the suffix convention rename to match it
  (`tests/db/connection-int.test.ts` → `tests/db/connection.int.test.ts`),
  and the api vitest config gains the `unit` / `integration` projects.

## Alternatives considered

**Colocated tests (`foo.test.ts` beside `foo.ts`).** Rejected. Mixes shipping
and non-shipping code in every folder and spreads the suite across the tree.

**`src/tests/` inside the source tree.** Rejected. Puts non-shipping code
under the emit root, forcing every workspace to carry a tsconfig exclusion,
and makes `src/**` globs silently match test code.
