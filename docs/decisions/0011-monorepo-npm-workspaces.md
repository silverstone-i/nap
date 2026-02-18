# 0011. Monorepo with npm Workspaces over Separate Repos

**Date:** 2025-02-17
**Status:** accepted
**Author:** NapSoft

## Context

NAP consists of a React SPA frontend, an Express API backend, and shared utilities (constants, type definitions). These packages have interdependencies — the client and server both consume shared types, and changes to shared code must be tested against both consumers. The repository structure must support atomic cross-package changes, unified tooling, and a single `npm install` for the entire project.

## Decision

Use a monorepo with npm workspaces (npm >= 10, shipping with Node 20):

```
nap/
  apps/
    nap-client/     # React SPA (Vite)
    nap-serv/       # Express API (Node.js)
  packages/
    shared/         # Shared utilities and constants
```

**Root scripts:** `dev`, `build`, `lint`, `test`, `prepare` (Husky installation)

**Workspace scripts:**
- `npm -w apps/nap-serv run dev` — start Express via nodemon
- `npm -w apps/nap-client run dev` — start Vite on port 5173
- `npm install` at the root installs dependencies for all workspaces with hoisted `node_modules`

**Build order:** Server first, then client (sequential).

**Husky integration:** Pre-commit hook enforces single-workspace commits to keep git history cleanly scoped.

## Alternatives Considered

| Alternative | Pros | Cons |
|---|---|---|
| Separate repositories (one per package) | Clear ownership boundaries; independent CI/CD pipelines; simpler per-repo tooling | Shared code requires publishing to a registry or git submodules; cross-package changes require coordinated PRs; version drift between repos; no atomic changes |
| Monorepo with Nx/Turborepo | Sophisticated build caching; dependency graph-aware task runner; remote cache support | Additional tooling complexity; overkill for a two-app monorepo; learning curve for the task runner; npm workspaces are sufficient for NAP's scale |

## Consequences

**Positive:**
- Shared code in `packages/shared` is consumed directly — no publishing or version synchronization needed
- Unified tooling — single `package.json` for root scripts, single CI configuration, single Husky setup
- Atomic cross-package changes — a single commit can update shared types and both consumers simultaneously
- Single `npm install` — no multi-repo checkout and install choreography

**Negative:**
- Husky pre-commit hook adds friction by blocking mixed client/server commits — requires `--no-verify` for legitimate cross-workspace changes
- All developers must clone the entire repository even if they only work on one package
- CI runs all workspace tests unless scoped manually — not yet an issue at current project size
