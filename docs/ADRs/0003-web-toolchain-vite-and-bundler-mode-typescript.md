# 0003 — Web toolchain: Vite and bundler-mode TypeScript

- **Status:** Accepted
- **Date:** 2026-08-01

## Context

[ADR-0002](0002-typescript-adoption.md) pinned the repo's TypeScript
settings — `module: nodenext`, `.js`-suffixed relative imports, and a
tsc-emit dev loop — all premised on Node executing the emitted output.

`apps/web` is a browser SPA. Nothing in Node ever executes its `src/`; a
bundler resolves, transforms, and serves it. The React ecosystem (Vite,
`@vitejs/plugin-react`, MUI, react-router documentation and examples)
assumes bundler resolution and extensionless imports; forcing nodenext
semantics onto it fights every tool in the chain for no runtime benefit.

A second, related decision was undocumented: which build tool the web app
uses at all.

## Decision

- `apps/web` is a **Vite 8** single-page app (`@vitejs/plugin-react`),
  React 19, MUI Material 9 + MUI X Data Grid 9. Material UI and MUI X share
  major versions as of v9, so the consistency rule is simple: keep
  `@mui/material` and `@mui/x-data-grid` on the same major, and bump React
  only when that shared major supports it.
- `apps/web/tsconfig.json` deviates from ADR-0002 in exactly the
  bundler-shaped settings, scoped to `apps/web` only:
  `moduleResolution: bundler`, extensionless relative imports,
  `jsx: react-jsx`, `noEmit: true`. Everything else carries over
  unchanged: `strict`, `target: es2023`, ES modules, and the TypeScript
  compiler pinned `~6.0.3` at the workspace root — **no per-app
  `typescript` dependency** (a stock Vite template's TS 7.x dependency
  would put the linter on an unsupported compiler; see ADR-0002).
- ADR-0002's "type errors surface in the loop" guarantee is preserved
  differently: `vite build` is gated behind `tsc --noEmit`
  (`build: tsc --noEmit && vite build`), and `typecheck` is a first-class
  root check fanned out across workspaces. `vite dev` alone does not
  typecheck; the editor, `npm run typecheck`, and CI are the gates. This
  is accepted for the inner loop — a browser dev server with HMR is the
  point of Vite, and pairing it with a second tsc watch process is
  available to anyone who wants it without further decisions.

ADR-0002 continues to govern `apps/api` and the root compiler pin.

## Consequences

- Web `src/` files use extensionless relative imports; api `src/` files
  keep `.js` suffixes. The difference is per-workspace tsconfig, not
  per-file judgment.
- Vitest for web runs through `vite.config.ts` (jsdom environment) rather
  than a separate vitest config file.
- A web `src/` layering ADR (the mirror of
  [ADR-0001](0001-api-layering-and-module-structure.md)) is deferred until
  the first real web module lands; the scaffold's four folders don't yet
  justify one.
- Dark mode will ship with the scaffold: `src/theme/tokens.ts` holds the
  light and dark token sets (single source), `theme.ts` builds one
  `createTheme` per mode, and `ThemeModeProvider` switches between them
  from a `system | light | dark` preference persisted in localStorage.
  MUI's `CssVarsProvider` was considered and not used — two prebuilt
  themes are simpler and the flash-of-wrong-mode it prevents doesn't
  apply to a client-rendered SPA. Conventions in
  [RULES/web-shell.md](../RULES/web-shell.md).

## Alternatives considered

**nodenext + `.js` suffixes inside `apps/web`.** Rejected. Vite tolerates
it, but every ecosystem example, codemod, and generated snippet fights it,
and the suffixes document a Node resolution behavior that never runs in
the browser bundle.

**Next.js or another SSR framework.** Rejected. Server rendering buys
nothing for an authenticated internal ERP shell, and it would couple the
web app to a second server runtime beside the Express API.

**Two ADRs (toolchain and tsconfig separately).** Rejected. Choosing Vite
_is_ choosing bundler resolution; splitting them would produce two records
that can only be read together.
