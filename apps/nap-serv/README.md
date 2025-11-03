# nap-serv

`nap-serv` powers the Next-Gen Accounting Platform (NAP). It is a Node.js/Express API backed by
PostgreSQL with strict tenant isolation and feature modules for projects, budgeting, accounting, and
RBAC-controlled workflows.

---

## Where This Module Lives

This project is part of the NAP monorepo (`apps/nap-serv`). Related workspaces:

- `apps/nap-client` – React/Vite frontend
- `packages/shared` – shared utilities and constants

---

## Prerequisites

- Node.js 20+
- PostgreSQL 14+ accessible to the application
- Redis (for auth + permissions cache)
- pnpm/npm (the repo uses npm workspaces)

Ensure environment variables are configured (copy `.env.example` when available).

---

## Local Setup

1. Install dependencies from the repo root:
   ```bash
   npm install
   ```
2. Start the backend (with optional client):
   ```bash
   npm run dev              # full stack
   npm run dev -- --filter apps/nap-serv  # server only
   ```
3. Run migrations for a local tenant:
   ```bash
   npm run migrate:dev
   ```

The API listens on the port specified by `NAP_SERV_PORT` (default `4000`).

---

## Useful Scripts

| Command                     | Description                                                |
|-----------------------------|------------------------------------------------------------|
| `npm run dev`               | Start server with nodemon                                  |
| `npm run start`             | Production start                                           |
| `npm run lint`              | Run ESLint                                                 |
| `npm test`                  | Run the full Vitest suite                                  |
| `npm run test:unit`         | Unit tests only                                            |
| `npm run test:integration`  | Integration tests                                          |
| `npm run migrate:dev`       | Execute pg-schemata migrations for development schemas     |
| `npm run migrate:test`      | Run migrations against the test database                   |
| `npm run seed:rbac`         | Seed default RBAC roles/policies (uses `seed_rbac.js`)     |

---

## Documentation

Authoritative docs now live under `apps/nap-serv/docs/`:

- `developer-guide.md` – coding standards, project structure, testing strategy
- `architecture.md` – runtime topology, tenancy, module registry
- `domain-model.md` – budgeting, costing, AP/AR, and reporting rules
- `auth-rbac.md` – authentication lifecycle, permission cache, RBAC schemas

Update these documents when behaviour changes; do not resurrect the old scattered Markdown files.

---

## Support & Contributions

- Follow [Conventional Commits](https://www.conventionalcommits.org/) with scopes like
  `feat(serv)` and `fix(activities)`.
- Run lint/test suites before submitting pull requests.
- Coordinate schema changes with migration updates and docs.

Licensed under the MIT License.
