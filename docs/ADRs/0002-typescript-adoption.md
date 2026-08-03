# 0002 — TypeScript adoption

- **Status:** Accepted
- **Date:** 2026-08-01

## Context

The original stack decision was JavaScript with ES modules, no TypeScript.
That decision was recorded in CLAUDE.md before any application code existed.
Before scaffolding began, the decision was reversed: the API (and later the
web app) will be written in TypeScript.

At adoption time the TypeScript release landscape is unusual. npm's `latest`
tag points at 7.x, the native Go-based compiler. The 6.x line — the final
JS-based compiler line, which 7 tracks — ships in parallel with no dist-tag,
so a bare `npm i typescript` installs 7. typescript-eslint, the lint
toolchain this repo standardizes on, supports `typescript >=4.8.4 <6.1.0`
and therefore does not support 7.

## Decision

- All application code in `apps/` is TypeScript. The AGPL header requirement
  and every other source-file rule apply to `.ts` files.
- The compiler is pinned `~6.0.3` at the workspace root — the newest stable
  line inside typescript-eslint's supported range. The pin is deliberate:
  upgrading past `<6.1.0` (or to 7.x) without checking typescript-eslint's
  current support range breaks linting. Revisit the pin when typescript-eslint
  widens its range.
- Module system is unchanged from the original decision: ES modules
  everywhere (`"type": "module"`). Compiler settings: `module: nodenext`,
  `moduleResolution: nodenext`, `target: es2023` (Node 24 is the runtime
  floor, pinned by `.nvmrc`), `strict: true`. Emitted output goes to each
  workspace's `dist/`; relative imports carry the `.js` extension as nodenext
  resolution requires.
- The dev loop is `tsc --watch` emitting to `dist/` plus `node --watch`
  restarting the server on re-emit. No transform-only runners (tsx, ts-node):
  what runs in dev is the same emitted JS that runs in production, and type
  errors surface in the loop rather than only in the editor.

## Consequences

- CLAUDE.md's stack section changes from "no TypeScript" to this decision;
  this ADR is the record of why.
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

**Stay on JavaScript with JSDoc types.** Rejected. Checked JSDoc gives weaker
inference and noisier annotations for the same tooling cost, and the project
has no existing JS codebase to protect — greenfield is the cheapest possible
point to adopt TypeScript.
