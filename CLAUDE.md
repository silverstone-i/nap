# CLAUDE.md

Guidance for Claude Code (and contributors) working in this repository.

NAP is a horizontal, project-native, multi-entity ERP. The core is industry-agnostic; the initial release targets the construction industry. See [README.md](README.md) for the full overview and [COLLABORATION.md](COLLABORATION.md) for contribution policy.

> **Status:** API server shell — health check, Postgres startup probe over the db layer, module registry awaiting its first module. `apps/web` is the mock-data shell walkthrough of [PRD 0001](docs/PRDs/0001-web-app-shell-and-mock-walkthrough.md) — no real API wiring yet. Sections marked _(planned)_ describe intent, not current state.

## Stack

- PERN: Postgres 18, Express 5, React 19, Node 24 (pinned by `.nvmrc`)
- TypeScript, pinned `~6.0.3` — typescript-eslint supports `>=4.8.4 <6.1.0` and npm's `latest` tag points at 7.x, so a bare `npm i typescript` is wrong; keep the tilde pin and do not upgrade past the typescript-eslint supported range (see [ADR-0002](docs/ADRs/0002-technology-stack.md))
- ES modules throughout (`"type": "module"`); `apps/api` compiled with `tsc` (`module: nodenext`, `target: es2023`, `strict`); `apps/web` bundled with Vite 8 (`moduleResolution: bundler`, same strictness — see [ADR-0003](docs/ADRs/0003-web-toolchain-vite-and-bundler-mode-typescript.md))
- Lint: ESLint 10 flat config + `typescript-eslint`; format: Prettier 3 (`eslint-config-prettier` keeps them out of each other's way)
- Schema-per-tenant isolation via the owned `pg-schemata` library _(planned)_
- Auth: JWT in httpOnly cookies; Redis for permission caching _(planned)_
- Client: React 19 + MUI 9 + MUI X Data Grid v9 (Material and X share major versions — keep `@mui/material` and `@mui/x-data-grid` on the same major)
- Tests: Vitest (+ supertest for HTTP)

## Checks

Run from the repo root, on Node 24 (`nvm use`):

- `npm run lint` — ESLint over the whole repo
- `npm run typecheck` — `tsc --noEmit` in every workspace
- `npm test` — Vitest in every workspace
- `npm run build` — `tsc` emit to `apps/api/dist/`; `tsc --noEmit && vite build` to `apps/web/dist/`
- `npm run format:check` — Prettier verification
- `npm run dev` — api dev loop: `tsc --watch` + `node --watch dist/server.js`
- `npm run dev:web` — Vite dev server for `apps/web` (no typechecking — run `typecheck` before pushing)

All checks must be green before any push.

## Repository layout

- `apps/api/` — Express API (TypeScript, `src/`)
- `apps/web/` — React app (Vite 8 SPA)
- `docs/`
  - `architecture/`
  - `branding/` — app branding
  - `PRDs/` — product requirements documents, one per module functional component; format governed by [RULES/prd-format.md](docs/RULES/prd-format.md)
  - `ADRs/` — architecture decision records; [ADRs/INDEX.md](docs/ADRs/INDEX.md) lists them all
  - `RULES/` — per-module rules docs. Any change to server code must update the corresponding rules doc, or the PR must carry a `no-doc-change` label with justification.

## ADRs

Architecture decisions live in `docs/ADRs/`. [docs/ADRs/INDEX.md](docs/ADRs/INDEX.md) lists every ADR with the scope it governs — read the index before planning structural work (layering, module boundaries, schema scope, routing, auth), then read in full any ADR whose scope touches the task. Do not propose a change that contradicts an accepted ADR; if the decision needs revisiting, say so and write a new ADR that supersedes it.

## Commit rules

- Every commit needs a DCO sign-off: use `git commit -s`. The husky `commit-msg` hook rejects commits without a valid `Signed-off-by:` trailer.
- Subjects in the imperative mood ("Add tenant schema resolver"). Conventional Commits prefixes (`feat:`, `fix:`, `docs:`, `chore:`) encouraged, not enforced.
- Branch names use the same prefixes with a slash: `feat/`, `fix/`, `docs/`, `chore/` (e.g. `feat/web-app-shell`).
- Branch commits may freely mix `apps/api/` and `apps/web/` changes — PRs are squash-merged (the repo allows no other merge method), so main gets exactly one commit per PR regardless of branch history. Keep PRs scoped to one concern; the squashed commit message describes the PR, not the individual commits.

## Release rules

This repo is on the labeled-PR release contract (see `.github/workflows/release-on-merge.yml`):

- `main` is the only long-lived branch. Branch off it, PR back into it.
- A PR that should release carries exactly one `release:patch` / `release:minor` / `release:major` label before merge, and must add entries under `## [Unreleased]` in `CHANGELOG.md`. Unlabeled merges release nothing.
- CI owns version bumps, changelog promotion, tags, and GitHub Releases. Never edit a version field, never move entries out of `## [Unreleased]`, never create or push tags, never push to `main`.
- The version source is the root `package.json`.

## Licensing rules

The project is AGPL-3.0-or-later.

- Every new source file must start with this header (comment syntax adjusted per language):

  ```
  Copyright (c) 2026–present Ian Silverstone.
  SPDX-License-Identifier: AGPL-3.0-or-later
  ```

  Documentation and configuration files are exempt.

- Production dependencies must carry an AGPL-compatible license from the allowlist at `.licenses-allowed.json` _(planned)_. Adding a prod dep with a new license requires updating the allowlist in the same PR, with justification in the PR body. `devDependencies` are not restricted.
- Rejected for production deps: `GPL-2.0-only`, `BUSL-*`, `SSPL-*`, Commons-Clause, and any proprietary or unlicensed package.

## Security

Never open a public issue for a vulnerability. Report privately via [GitHub security advisories](https://github.com/silverstone-i/nap/security/advisories/new) or <ian@isilverstone.com>.
