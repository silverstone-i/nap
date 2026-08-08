# RULES — API server bootstrap

Governs `apps/api/src/server.ts`, `apps/api/src/app.ts`, and the dev loop
configuration in `apps/api/package.json`.

## Entrypoint vs composition root

The split is load-bearing; keep it.

- `src/server.ts` is the only file that binds a port or reads `process.env`
  for startup config. Nothing imports it. (`src/scripts/` entrypoints will read
  `process.env` too — they are outside the runtime import graph and are the
  only other place that may.)
- `src/app.ts` exports `createApp()`, which builds and returns the Express app
  and never listens. Tests import this directly and drive it in-process via
  supertest — no port, no teardown.

`createApp()` must not require a database. The database is opened by the
entrypoint, so the health test keeps running with no Postgres anywhere.

## Startup and shutdown

`server.ts` runs a fixed order: read `process.env` → `initDb()` →
`probeDb()` → `listen()`. The probe is a `SELECT 1`; when it fails the process
logs, drains the pool, and exits non-zero rather than serving traffic against
an unreachable database.

`SIGINT`/`SIGTERM` reverse it: stop accepting connections (`server.close()`),
then `closeDb()`, then exit 0. `closeDb()` is terminal — the pg-schemata
singleton cannot be re-initialized afterwards. See
[RULES/db-and-migrations.md](db-and-migrations.md).

## Health check

`GET /health` is mounted directly in `createApp()`, not in a module under
`modules/`. This is deliberate: health must answer before auth, rbac, or
entitlement middleware exist and must never be gated by them. Do not move it
into a module or behind the standard per-route chain when those land.

## Middleware order in `createApp()`

Order is significant: `express.json()` and `cookie-parser`, then the `/api`
mount of `src/apiRoutes.ts`, then the 404 handler, then the error handler —
the last two only work as the final two `app.use` calls.

The error handler takes four parameters (`err, req, res, next`). Express 5
still detects error handlers by arity; dropping the unused `next` silently
demotes it to ordinary middleware.

`createApp(logger?, config?)` takes an `AppConfig`
(`src/util/appConfig.ts`): the access-token secret, cookie flags, and argon2
parameters. The defaults exist for tests only — the secret default is a fresh
random key per process, never a hardcoded value — and `server.ts` resolves
the real config from env, throwing when `ACCESS_TOKEN_SECRET` is unset.
Building the routers touches no database; handlers reach `getDb()` per
request, so `createApp()` still works with no Postgres anywhere.

## Adding a module router

Mount it in `src/apiRoutes.ts`, one
`apiRoutes.use('/<feature>/v1', create<Feature>V1(config))` line per module,
importing from `modules/<feature>/apiRoutes/v1/`. Per
[ADR-0001](../ADRs/0001-api-layering-and-module-structure.md) this file plus
the module registry in `src/db/` are the two hand-maintained registration
points. The auth router is the pattern's first instance (see
[auth-module.md](auth-module.md)).

## Dev loop

`npm run dev` runs two processes via concurrently: `tsc --watch` emitting to
`dist/`, and `node --watch dist/server.js` restarting the server when the
emitted files change. There is no nodemon and no transform-only runner (tsx,
ts-node) — what runs in dev is the emitted JS, and type errors surface in the
watch output. See [ADR-0002](../ADRs/0002-technology-stack.md).

`node --watch` restarts as soon as tsc re-emits; there is no restart debounce.

## Config

Read config through `process.env` with an explicit fallback
(`process.env.PORT ?? 3000`) so a missing variable fails visibly at the point
of use rather than as `undefined` deep in a call stack. `.env` loading is
Node-native — the `dev`/`start` scripts pass `--env-file-if-exists=.env` (no
dotenv dependency; the `-if-exists` variant keeps CI, which exports its
environment directly, from failing on the absent file). `.env` stays
gitignored, `.env.example` is committed, and every new variable must be added
to `.env.example` with a safe default in the same change.

## Scripts

`src/scripts/` entrypoints follow the `server.ts` shape: module-level
top-level await, env read up front through small pure resolvers, `initDb()`
before any query, `closeDb()` on every exit path, non-zero exit on failure.
Testable logic lives beside them in `src/scripts/lib/` — env-free functions
the entrypoint calls and tests import directly. Each entrypoint gets an npm
script in `apps/api/package.json` shaped like `start`
(`node --env-file-if-exists=.env dist/scripts/<name>.js` — build first),
optionally forwarded from the root `package.json`.

Current scripts: `db:bootstrap` → `dist/scripts/bootstrap-admin.js`, reading
`ROOT_TENANT_CODE`, `ROOT_COMPANY`, `ROOT_EMAIL`, `ROOT_PASSWORD`, and the
`ARGON2_*` parameters (see [db-and-migrations.md](db-and-migrations.md) for
what it does; [auth-module.md](auth-module.md) for the hashing rules).
