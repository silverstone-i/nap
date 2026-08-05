# 0002 — Technology stack

- **Status:** Accepted
- **Date:** 2026-08-01

## Context

NAP is a greenfield, multi-tenant ERP: an API over a relational database
with a browser client, built by a small team that owns its own supporting
library (pg-schemata). The stack decision fixes the languages, runtimes, and
core dependencies every workspace builds on, so it is recorded before any
application code exists.

At adoption time the TypeScript release landscape is unusual. npm's `latest`
tag points at 7.x, the native Go-based compiler. The 6.x line — the last
release line before the compiler's Go rewrite, which 7 tracks — ships in
parallel with no dist-tag, so a bare `npm i typescript` installs 7.
typescript-eslint, the lint toolchain this repo standardizes on, supports
`typescript >=4.8.4 <6.1.0` and therefore does not support 7.

## Decision — the stack

- **PERN**: Postgres 18, Express 5, React 19, Node 24. Node is the runtime
  floor, pinned by `.nvmrc`.
- **TypeScript** for all application code in `apps/`. The AGPL header
  requirement and every other source-file rule apply to `.ts` files.
- **Schema-per-tenant isolation** via the owned pg-schemata library.
- **Auth**: JSON Web Token (JWT) in httpOnly cookies; Redis for permission
  caching.
- **Client**: React 19 with MUI Material 9 and MUI X Data Grid 9 (toolchain
  detailed in
  [ADR-0003](0003-web-toolchain-vite-and-bundler-mode-typescript.md)).
- **Tests**: Vitest, with supertest for HTTP.

## Decision — TypeScript toolchain

- The compiler is pinned `~6.0.3` at the workspace root — the newest stable
  line inside typescript-eslint's supported range. The pin is deliberate:
  upgrading past `<6.1.0` (or to 7.x) without checking typescript-eslint's
  current support range breaks linting. Revisit the pin when typescript-eslint
  widens its range.
- Module system: ES modules everywhere (`"type": "module"`). Compiler
  settings: `module: nodenext`, `moduleResolution: nodenext`,
  `target: es2023` (matching the Node 24 floor), `strict: true`. Emitted
  output goes to each workspace's `dist/`; relative imports carry the `.js`
  extension as nodenext resolution requires.
- The dev loop is `tsc --watch` emitting to `dist/` plus `node --watch`
  restarting the server on re-emit. No transform-only runners (tsx, ts-node):
  what runs in dev is the same emitted JS that runs in production, and type
  errors surface in the loop rather than only in the editor.
- `apps/web` deviates in exactly the bundler-shaped settings, scoped to that
  workspace and recorded in
  [ADR-0003](0003-web-toolchain-vite-and-bundler-mode-typescript.md); this
  ADR continues to govern `apps/api` and the root compiler pin.

## Consequences

- `typecheck` (`tsc --noEmit`) joins lint/test/build as a required check.
- Type stubs (`@types/*`) are devDependencies and exempt from the production
  license allowlist, like all devDependencies.

## Alternatives considered

**TypeScript 7 from day one.** Rejected for now. 7.0.2 is stable and fast,
but typescript-eslint does not support it, and running the linter against an
unsupported compiler version trades away exactly the guarantees linting is
for. Adopt once the toolchain catches up.

**tsx / ts-node dev loop.** Rejected. Single-process and convenient, but
esbuild-style transforms strip types without checking them, so a type error
runs silently in dev. The two-process tsc + `node --watch` loop keeps the
compiler in the loop.
