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

Install PostgreSQL 18 client/server tooling and OpenSSL on PATH. Operator commands
require an explicit `--env dev|test|prod`. Follow the
[database provisioning runbook](docs/guides/database-provisioning.md) for credentials,
Render settings, recovery, and activation.

```bash
npm run db:setup:admin -- --env dev
npm run db:migrate:admin -- --env dev
npm run db:bootstrap -- --env dev
```

Start the API and web app in separate terminals:

```bash
npm run dev:api
npm run dev:web
```

Sign in as root, then open **Tenant Management → Cells → Register cell**.
The first successfully provisioned cell automatically hosts NapSoft and completes
root's tenant access and RBAC setup. Check progress under **Tenant Management →
Tenants**. See the [Database provisioning guide](docs/guides/database-provisioning.md)
for prerequisites, configuration, and bootstrap failure/retry instructions.

To start DEV again from empty databases, stop the API and run:

```bash
npm run db:clean:dev -- --confirm
```

This permanently deletes `nap_dev_admin` and every `nap_dev_cell_*` database
owned by `nap_admin` on the `SETUP_DATABASE_DEV` server, deletes
`apps/api/.env.provisioning.dev.json`, and sets `CELL_DATABASES_DEV='{}'` in
`apps/api/.env`. PostgreSQL roles and configured passwords are preserved.
Then repeat the setup, migration, bootstrap, and startup sequence above.
The [cleanup details](docs/guides/database-provisioning.md#clean-development-environment)
explain scope and recovery after an interrupted cleanup.

Runtime still selects configuration using NODE_ENV. Maintenance commands use their
explicit environment and private provisioning state. DEV and TEST use independently
shared role passwords; PROD uses independent instance passwords. Never commit
`.env` or provisioning state. The test suite owns disposable databases and test data.

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
Register cell persists and loads new connections without restarting. Recovery of an already configured cell
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

Create cells through **Management → Cells → Register cell**. The server provisions, migrates, seeds and activates without restarting. TEST fixtures use the shared service directly. See [database provisioning](docs/guides/database-provisioning.md).
