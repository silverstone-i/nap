# ADR 0011 — Monorepo with npm Workspaces

**Status:** Accepted
**Date:** 2025-02-22
**Deciders:** NapSoft Engineering

## Context

The application has three logical packages — a backend Express server (`nap-serv`), a React + Vite frontend (`nap-client`), and a shared utilities library (`shared`). These packages share configuration (ESLint, Prettier, environment variables) and are always deployed together.

## Decision

Organise the project as a **monorepo** using **npm workspaces** (built into npm ≥ 7).

### Directory Layout

```
nap/
├── apps/
│   ├── nap-serv/      # Express 5 backend
│   └── nap-client/    # React 18 + Vite frontend
├── packages/
│   └── shared/        # Shared constants & utilities
├── docs/
├── .env               # Single env file at root
├── package.json       # Root — workspaces config, shared scripts
└── eslint.config.js   # Flat config shared across workspaces
```

### Workspace Configuration

Root `package.json` declares:

```json
{
  "workspaces": [
    "apps/*",
    "packages/*"
  ]
}
```

### Shared Scripts

| Script | Scope | Purpose |
|--------|-------|---------|
| `npm run dev` | Both | Starts backend (nodemon) and frontend (Vite) concurrently |
| `npm run dev:serv` | Backend | Backend only with 5-second startup delay |
| `npm run dev:client` | Frontend | Vite HMR dev server |
| `npm run lint` | All | ESLint 9 flat config across the monorepo |
| `npm -w apps/nap-serv test` | Backend | Vitest test suites |

### Cross-Workspace Dependencies

The `shared` package is consumed via workspace protocol:

```json
{
  "dependencies": {
    "shared": "*"
  }
}
```

npm resolves this to a symlink, so changes are immediately visible without publishing.

### Environment Variables

A single `.env` file lives at the monorepo root. The database module (`db.js`) walks up from the workspace directory to find it, so both local development and workspace-scoped test commands resolve the same file.

### Alternatives Considered

1. **Turborepo / Nx** — Adds build caching and task orchestration but introduces tooling complexity that is not yet needed at current project scale.
2. **Yarn workspaces / pnpm** — Functionally similar to npm workspaces; npm was chosen to avoid adding another package manager.
3. **Separate repositories** — Eliminates workspace tooling but makes cross-cutting changes (shared types, coordinated deploys) significantly harder.

## Consequences

- A single `npm install` at the root hoists all dependencies, avoiding version drift between workspaces.
- Husky pre-commit hooks enforce workspace separation in commits (no mixed `nap-client` + `nap-serv` changes).
- CI runs a single checkout and can parallelise workspace-scoped tasks (lint, test, build).
- The `shared` package is available immediately without a publish step.
