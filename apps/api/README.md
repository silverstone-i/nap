# @nap/api

Express backend-for-frontend (BFF) for NAP. It owns the admin database
connection, the health routes, and the maintenance commands that set up and
migrate the admin database. Business routes, sessions, and cell routing are
later Work Units; see the [roadmap](../../docs/roadmap/ROADMAP.md).

## Layout

`src/` follows [module design](../../docs/architecture/module-design.md).

| Folder                                                              | Contents                                                                                              |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `app.js`, `server.js`                                               | Express app factory and the process entry point.                                                      |
| `application/shared/`                                               | Environment loading, endpoint validation, runtime configuration, and `MaintenanceError`.              |
| `application/maintenance/`                                          | The setup and migrate operations behind the `db:*` commands.                                          |
| `application/runtime/`                                              | HTTP runtime: startup, readiness, and drained shutdown.                                               |
| `infrastructure/provisioning/`                                      | Local PostgreSQL setup, Render provisioning, and the private state file.                              |
| `infrastructure/runtime/`                                           | Admin database handle and the runtime readiness check.                                                |
| `modules/admin.js`                                                  | Admin module registry and its validation.                                                             |
| `modules/admin-tenancy/`                                            | Twelve table models, repositories, the baseline migration, trigger bodies, and contract verification. |
| `capability/`, `framework/`, `middleware/`, `infrastructure/cache/` | Reserved by the architecture. Not yet implemented.                                                    |

## Commands

Run from the repository root.

| Command                                 | Purpose                                                           |
| --------------------------------------- | ----------------------------------------------------------------- |
| `npm run dev:api`                       | Start the API with file watching on port 3000.                    |
| `npm run db:setup:admin -- --env dev`   | Create or verify the admin database and roles.                    |
| `npm run db:migrate:admin -- --env dev` | Apply pending admin migrations and verify the installed contract. |
| `npm test`                              | Unit tests. No database needed.                                   |
| `npm run test:db`                       | PostgreSQL integration tests. Needs `FOUNDATION_TEST_URL`.        |

`--env` accepts `dev`, `test`, or `prod`. Each command prints one JSON line and
exits nonzero on failure. Output never contains credentials.

## Configuration

Copy `.env.example` to `.env`, then follow the
[development setup](../../docs/guides/development-setup.md) or
[production setup](../../docs/guides/production-setup.md) guide. `NODE_ENV`
selects the `*_DEV`, `*_TEST`, or `*_PROD` settings. Inherited environment
variables override the file.

## Runtime behavior

- Startup loads configuration, connects as `nap-app`, and refuses to listen
  until the readiness check passes. It never runs setup or migrations.
- `/health/live` reports process liveness. `/health/ready` reports database
  readiness and returns 503 otherwise.
- In production the API serves `apps/web/dist`. Paths under `/api` and
  `/health` never fall back to the web client.
- SIGINT and SIGTERM drain in-flight requests, close the pool, and exit.

## Database roles

`nap-admin` owns the database and runs setup and migrations. `nap-app` is the
runtime role with CRUD on the twelve admin tables and nothing else. Setup and
the readiness check both verify these attributes. The contract is defined in
[M0001-00](../../docs/PRDs/modules/M0001-admin-tenancy/M0001-00-admin-database-foundation.md).

## Tests

- `tests/*.test.js` and `tests/unit/` run without a database and mock provider
  calls.
- `tests/integration/` create temporary databases on the server named by
  `FOUNDATION_TEST_URL` and run serially. Use a disposable PostgreSQL 18 server.
