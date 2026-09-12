# nap

NAP is a hobby project that I have long wanted to do. Rather than spend an inordinate amount of time figuring out what to name the project I went with Not Another Program (NAP), but if you prefer you can think of it as Next-generation Accounting Platform.

NAP is a horizontal, project-native, multi-company ERP. The base ERP core — multi-tenant infrastructure, RBAC, master data (vendors, clients, employees, contacts, companies), projects, activities, AP/AR, double-entry accounting, cashflow, and profitability — is designed to be industry-agnostic. However, the initial release of the project will focus on the construction industry and the services necessary to meet those needs

## Stack

NAP uses PostgreSQL, Express, React, and Node. The API is a modular monolith
with a separate central administration database and one or more tenant-cell
databases. Cell databases use shared tenant tables protected by PostgreSQL
row-level security, enforced through a non-owning runtime role rather than
forced on the table owner. Redis caches derived session, routing, and
authorization state so those lookups stay off the database path, but
PostgreSQL always decides: no authorization outcome depends on the cache.

The [platform specification](docs/specs/nap-platform-specification.md) owns
these choices. Its
[technology stack](docs/specs/nap-platform-specification.md#technology-stack)
section names one dependency per role and the boundary each one sits behind;
[deployment topology](docs/specs/nap-platform-specification.md#deployment-topology)
and
[database composition roots](docs/specs/nap-platform-specification.md#database-composition-roots)
own the admin-and-cell split; requirements `ARCH-013`-`ARCH-021` own tenant
isolation and `ARCH-029` owns the Redis boundary. Package manifests, the
lockfile, `.nvmrc`, and `tsconfig.base.json` own the exact installed versions
and compiler settings.

## Local development

Use the Node version pinned in `.nvmrc` (`nvm use`), then run `npm ci`.

- `npm run dev:api` starts the API on port 3000 and watches TypeScript output.
- `npm run dev:web` starts Vite on its reported local URL (normally port 5173).
- `npm run build --workspace @nap/api`, `@nap/web`, or `@nap/shared` builds
  that workspace. Application builds first build the public shared package.

The API exposes `GET /health/live` and `GET /health/ready`; other paths return
version-1 JSON errors. Every application response carries `X-Request-ID`.
Startup requires admin readiness and probes each configured cell independently.
Unavailable cells are quarantined and retried every 30 seconds while admin and
healthy cells remain available. The web uses the same public origin as the API.

Copy `apps/api/.env.example` to `apps/api/.env` for local configuration. The API
and database commands load that file without overriding inherited environment
values. The example documents implemented configuration names and placeholder
values. Never commit the local environment file.

### Database setup and checks

Install PostgreSQL 18 or later, including `psql`, `initdb`, `pg_ctl`, `pg_dump`, and `pg_restore` on PATH.
On macOS, Homebrew's `postgresql@18` provides these commands. Use an existing
administrative login with permission to create roles and databases for setup.
Set the `_DEV` endpoints and fixed-role passwords in the example, then
run `npm run db:setup:dev -- --cell-id <configured-cell-uuid>`. Use `_TEST`
settings with `npm run db:setup:test -- --cell-id <configured-cell-uuid>`.
Both targets must share the setup server, and migration credentials must match
the fixed nap_admin setup owner. Local endpoints accept no query parameters;
database identifiers use lowercase letters, digits, and underscores, starting
with a letter or underscore.

Setup creates missing databases and runtime roles, validates existing ownership
and privileges, and verifies credentials. It never resets passwords, drops data,
or creates application tables. Only `test` and `development` modes are supported.
After setup, run `npm run db:migrate:admin` and `npm run db:migrate:cell -- --cell-id <configured-cell-uuid>`.
These are explicit release operations, never API startup hooks. Migrations initialize the registered module schemas and tables with pg-schemata
tracking. Setup itself creates no application tables; module migrations own
tables and runtime grants.

`NODE_ENV` selects DEV, TEST, or PROD settings (development when absent).
Configuration follows the DEV (including isolated TEST), PROD, and Common
sections in `apps/api/.env.example`. NODE_ENV selects the environment. Code
builds URLs using fixed roles nap_app and nap_admin, shared local role passwords,
and separate endpoint entries. Production entries carry per-database passwords;
the API deployment omits adminPassword. Migration commands read only the selected
maintenance password. Inherited process values override the local file.
See [ADR 0012](docs/ADRs/0012-environment-configuration.md).

Runtime roles must not have elevated role flags, ownership, schema/database
creation grants, or membership paths to privileged/owning roles. A failed check
prevents listening. Shutdown and startup/listener failures close both pools.
Migration transactions are per schema: earlier schemas remain committed on a
later failure. Correct the cause and rerun without editing applied migrations.
Application rollback leaves schemas and tracking tables in place.

To erase a database's NAP schemas and start again, stop the API and run the
appropriate command with an explicit acknowledgement:

```sh
npm run db:reset:admin -- --confirm
npm run db:reset:cell -- --cell-id <configured-cell-uuid> --confirm
```

Admin reset drops `admin`; cell reset drops `reporting`, `app`, `reference`,
and `cell` in the configured cell database. Each reset removes all data and
migration history in those schemas, including dependent objects through
`CASCADE`, in one transaction. Databases and PostgreSQL roles are retained.
The commands select migration credentials using `NODE_ENV`, just like migrations;
check that it selects the environment you intend to erase. They do not discover
or reset other registered cells. A lock wait longer than five seconds aborts
the reset and rolls back its changes.

After resetting both targets, run `npm run db:migrate:admin`,
`npm run db:migrate:cell -- --cell-id <configured-cell-uuid>`, then `npm run db:bootstrap` to recreate the root login.
Cell registration and tenant provisioning must also be repeated. Resetting
only one target leaves the other target's records intact and may require
reconciliation before the application can use them again.

Run `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`,
`npm run build`, and `npm run licenses` before pushing. Local toolchain tests
start and clean up a temporary PostgreSQL cluster; they do not use your local
application databases. CI uses its disposable PostgreSQL service and unique
fixture databases/roles. HTTP tests require permission to open local sockets.

The license gate checks installed production dependencies, including hoisted
transitives, against `.licenses-allowed.json` using the lockfile's dependency
classification. Unknown licenses and missing required packages fail the check.

## Documentation

Start with the [documentation index](docs/README.md). It defines the authority,
purpose, reading order, and update relationship of PRDs, ADRs, RULES, project
structure, the development roadmap, and reference material.

## License

Released under the GNU Affero General Public License, version 3 or later (AGPL-3.0-or-later). See LICENSE.

If you run a modified version of NAP over a network, you must make the modified source available to your users. This is intentional: NAP is open infrastructure.

## Contributing

Contributions are welcome. Every commit must carry a Signed-off-by: trailer asserting the Developer Certificate of Origin (DCO 1.1). See COLLABORATION.md for details and the dependency policy.

The maintainer (Ian Silverstone) has sole enforcement authority over project policy.

## Copyright

Copyright (c) 2026–present NapSoft, LLC. All contributors retain copyright in their contributions, licensed to the project under AGPL-3.0-or-later via the DCO sign-off.

### API operations

Configure process liveness with `GET /health/live` and traffic readiness with
`GET /health/ready`. Successful probes return HTTP 200 and
`{"version":1,"data":{"status":"ok"}}`. Unready probes return HTTP 503 with a
safe shared error envelope; health responses are not cacheable. Probes reveal
no infrastructure details. Readiness freshly checks both runtime roles, shares
an outstanding check, and has a five-second total budget. Startup performs the
same check before opening HTTP. Keep the deployment probe timeout above five
seconds to receive the API's failure response.

JSON requests have a 100 KiB ceiling; compressed bodies and unsupported media
are refused. Unknown paths, parser errors, and unexpected faults use shared
version-1 errors. Reuse one valid UUID `X-Request-ID` or let the API generate it;
keep the returned value for support. Diagnostic logs are JSON on stdout with
stable events and request IDs, without hostname, raw URLs, bodies, credentials,
or arbitrary dependency messages. Database audit records remain independent.

SIGINT/SIGTERM stop readiness and admission, allow ten seconds for active HTTP
requests, and then allow five seconds for pool cleanup. Exhausted deadlines or
cleanup failures exit unsuccessfully. Set the deployment termination grace
period above fifteen seconds. Interrupted startup cannot later open a listener.
There are no automatic retries, metrics exporter, or sampling policy yet.

Deploy the API artifact and update probes together. No database migration or
credential change is needed. Roll back both the artifact and probe configuration
if reverting to a build without health endpoints.

### Multi-cell runtime configuration

Start with `CELL_DATABASES_DEV={}` for admin-only API configuration. Register
cells in Management → Cells and copy each UUID from its detail page. Add each
UUID and its credential-free endpoint to CELL_DATABASES_DEV. DEV and TEST use
NAP_APP_PSWD_* and NAP_ADMIN_PSWD_*; PROD entries contain their own passwords.
Connection-map changes require restart. Recovery of an already configured cell
still uses independent readiness probes.

Existing setup, migration, and reset commands require an explicit --cell-id;
setup still prepares admin and the selected cell together. This task changes
configuration consumption only: setup does not yet enforce registration or
physical database identity. Do not treat configuration selection as provisioning
verification. The complete empty-environment setup workflow is separate work.

Access maintenance retains
`npm run db:access -- seed <tenant-uuid> <cell-uuid>` and
`npm run db:access -- transition <reviewed-mapping.json> <cell-uuid>`.
It builds the selected maintenance connection from the same cell entry and
retains its existing central assignment checks.

Remove the old complete-URL variables, role-name overrides, unsuffixed
session/bootstrap/Redis/cookie/proxy settings, CELL_ID, CELL_CODE, API_MODE, and
CELL_API_ORIGINS. Obsolete settings fail with key-only diagnostics.
Production configuration updates and deployment are separate authorized operations.
See the [configuration plan](docs/implementation-plans/environment-configuration.md)
and [multi-cell plan](docs/implementation-plans/multi-cell-api.md).
