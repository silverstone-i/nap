# CLAUDE.md — Project Instructions for Claude Code

## Git & Commits

- **Never add `Co-Authored-By` lines** to commit messages — suppress the default trailer entirely
- Husky pre-commit rejects mixed commits touching both `apps/nap-client/` and `apps/nap-serv/` — split into separate commits
- Working branch: `dev`; PRs target `main`

## Project Overview

PERN monorepo for multi-tenant project costing / profitability / payments with double-entry accounting.

| Workspace | Stack | Entry |
|---|---|---|
| `apps/nap-serv` | Express 5, pg-schemata, Passport, Redis, Winston | `server.js` |
| `apps/nap-client` | React 18, Vite, MUI 5, MUI X Data Grid v6, TanStack Query | `src/main.jsx` |
| `packages/shared` | Shared constants and utilities | — |

## Key Commands

```bash
# Dev servers (from repo root)
npm run dev            # both servers
npm run dev:serv       # backend only (nodemon, 5 s delay)
npm run dev:client     # Vite HMR

# Lint
npm run lint           # ESLint 9 flat config, full monorepo

# Tests (nap-serv — Vitest, Node single-thread)
npm -w apps/nap-serv test              # all suites
npm -w apps/nap-serv run test:unit
npm -w apps/nap-serv run test:contract # supertest API tests
npm -w apps/nap-serv run test:integration
npm -w apps/nap-serv run test:rbac

# Database
npm -w apps/nap-serv run setupAdmin:dev   # bootstrap admin schema
npm -w apps/nap-serv run migrate:dev      # run migrations
npm -w apps/nap-serv run seed             # seed dev data
```

## Architecture

- **Multi-tenant**: schema-per-tenant isolation via pg-schemata; admin schema holds `tenants`, `nap_users`
- **RBAC**: 4-layer model — policies → data scope → state filters → field groups (see `docs/decisions/0013-four-layer-scoped-rbac.md`)
- **Auth**: Minimal JWT (sub + ph only) in httpOnly cookies; `authRedis` middleware hydrates `req.user` from nap_users + Redis permission cache
- **Soft delete**: `deactivated_at` column convention; most tables use pg-schemata `softDelete: true`
- **Audit fields**: `created_by`, `updated_by` (uuid, nullable), `created_at`, `updated_at`

## pg-schemata Conventions

- Schema defaults: use JS values (`default: 'active'`), NOT SQL literals (`default: "'active'"`) — pg-schemata auto-quotes for DDL but uses raw values for INSERT ColumnSet `def`
- When `userFields.type: 'uuid'`, audit fields (`created_by`/`updated_by`) must be uuid or null — never strings
- Circular FKs: remove from schema definition, add via `ALTER TABLE` in migration after all tables created
- `model.update(id, partialDto)` resets all ColumnSet columns to defaults — use raw SQL for single-column updates

## Code Style

- Prettier: single quotes, trailing commas, 144-char lines (80 for markdown), 2-space indent
- ESLint: unused vars warn with `^_` prefix ignore, console off
- MUI X Data Grid v6: `valueGetter(params)` accesses `params.row.field` — the `(value, row)` form is v7 only
- Prefer `layoutTokens.js` for repeating layout patterns and `theme.js` component overrides over inline `sx`

## Environment

- `.env` lives at monorepo root; `db.js` walks up from cwd to find it
- Databases: dev → `nap_dev`, test → `nap_test`, user → `nap_admin`
- PG extensions: `pgcrypto`, `uuid-ossp`, `vector`
- Node ≥ 20 (`.nvmrc`)
