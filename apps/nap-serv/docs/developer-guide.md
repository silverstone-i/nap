# Developer Guide

This guide consolidates the day-to-day knowledge required to work inside `apps/nap-serv`. It covers
environment setup, code organization, API conventions, schema rules, testing practices, and
contribution expectations. Use it as the canonical reference instead of the scattered Markdown files
that previously lived in `design_docs/`.

---

## Getting Set Up

- Install dependencies from the monorepo root: `npm install`
- Start both backend and client in dev mode: `npm run dev`
  - Or run the server only: `npm run dev -- --filter apps/nap-serv`
- Environment variables live in `apps/nap-serv/.env.[env]`. Copy `.env.example` if present.
- Husky hooks block commits that mix server and client changes; use `--no-verify` only when the
  cross-cutting change is intentional.

Useful scripts (`apps/nap-serv/package.json`):

| Script                | Description                                     |
|-----------------------|-------------------------------------------------|
| `npm run dev`         | Starts the API with nodemon                     |
| `npm run start`       | Production entry point                          |
| `npm run lint`        | ESLint across the module                        |
| `npm test`            | Vitest test suite (unit, integration, contract) |
| `npm run migrate:dev` | Runs pg-schemata migrations for dev tenants     |

---

## Monorepo Layout

The repository is npm-workspace based. Important paths:

- `apps/nap-serv` – this backend service
- `apps/nap-client` – Vite/React frontend
- `packages/shared` – shared utilities/constants

Server modules follow a feature-based hierarchy:

```
modules/<feature>/
  apiRoutes/v1/   # Express routers (one file per resource)
  controllers/    # Extends BaseController, exposes CRUD + custom logic
  models/         # Extends TableModel with pg-schemata schemas
  schemas/        # Table definitions consumed by models/migrations
  sql/ or utils/  # Feature-specific helpers (optional)
```

Keep directories shallow—favour domain grouping over type-based silos.

---

## Coding Conventions

- Use **ES Modules** everywhere (`import`/`export`). CommonJS is not allowed.
- Organise files by feature/module; avoid large “index.js” aggregators.
- Prefer small, composable functions; document non-trivial business rules with concise comments.
- Export controller classes *and* their singleton instance when tests need to inject dependencies.
- Repositories (`<feature>Repositories.js`) expose camelCase keys mapping to model classes.
- When adding a module:
  1. Define schemas in `schemas/` using pg-schemata typedefs.
  2. Create models extending `TableModel`.
  3. Wire controllers and routers with `createRouter`.
  4. Register the module in `src/db/moduleRegistry.js` and `src/apiRoutes.js`.

---

## Database & Schema Rules

- PostgreSQL with tenant isolation via separate schemas per customer.
- Table naming: plural `snake_case` (`vendor_skus`), columns `snake_case`.
- Common columns: `id uuid DEFAULT gen_random_uuid()`, `created_at`, `updated_at`,
  `deleted_at` (soft deletes).
- Foreign keys must specify `onDelete`. Index FK columns.
- `tenant_code` exists for cross-tenant admin insight, but **never** appears in unique constraints
  inside tenant schemas.
- Use `jsonb` for structured metadata. Prefer partial indexes to filter out soft-deleted records.
- Migrations are defined with `defineMigration`. Let `orderModels` handle creation order.

---

## API Design

- All routes mount under `/api`. Feature routers attach their own base path and version:
  - e.g. `router.use('/activities', activitiesRouter);` where downstream files expose `/v1/...`.
- Resource naming uses plural nouns. Keep routes shallow (`/projects`, `/projects/:id`).
- Query parameters are `snake_case` and commonly accept `limit`, `offset`, `sort`,
  plus feature-specific filters.
- Middleware stack in `src/app.js`:
  - CORS configuration (from env).
  - JSON/body parsing and cookie parser.
  - `authRedis()` attaches tenant context and RBAC caps.
  - Module routers register under `/api`.
- Logging is handled by Winston (`apiLogger`) via a JSON-producing Morgan stream.

---

## Testing

- Test runner: **Vitest**. Suites live under `tests/` (`unit`, `integration`, `contract`, `rbac`).
- Configure environment via `tests/setup.js` (JWT fixtures, etc).
- Use dependency injection for controller tests; avoid mocking entire DB modules.
- Integration tests should rely on seeded data/migrations, not mocks.
- Run targeted suites with `npm run test:<type>` or include Vitest filters (`npm test -- --runInBand`).

---

## Contribution Workflow

1. Branch from `main` using conventional naming (`feat/`, `fix/`, `chore/`).
2. Follow [Conventional Commits](https://www.conventionalcommits.org/) with scopes like
   `feat(serv)`, `fix(activities)`.
3. Keep pull requests focused on a single module or concern.
4. Ensure lint and tests pass before requesting review.
5. Document non-obvious changes in PR descriptions and update relevant sections of this guide when
   patterns evolve.

If you’re onboarding new contributors, point them at this file plus the `architecture.md` overview for
system context.

---

## References

- [`architecture.md`](./architecture.md) – system design and module breakdown
- [`domain-model.md`](./domain-model.md) – budgeting, costing, and accounting flows
- [`auth-rbac.md`](./auth-rbac.md) – authentication design and RBAC model
