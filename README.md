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

## Environment setup

Start with the guide for your environment:

- [Development setup](docs/guides/development-setup.md): fresh fork, macOS or Ubuntu tools, local PostgreSQL roles, private configuration, admin setup, first cell, checks and recovery.
- [Production setup on Render](docs/guides/production-setup.md): fork-specific Blueprint configuration, account credentials, paid resource creation, deployment, first cell and recovery.

Both guides distinguish verified operations from walkthroughs that have not been exercised. Follow the complete sequence before treating an installation as ready.

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

One API connects to admin and multiple cell databases. Management cell registration persists connection maps and loads the new cell without restarting; do not manually add a cell map as a replacement for registration. Follow the [environment setup guides](#environment-setup) for the complete lifecycle and recovery.

Access maintenance retains `npm run db:access -- seed <tenant-uuid> <cell-uuid>` and `npm run db:access -- transition <reviewed-mapping.json> <cell-uuid>` for their separate access-maintenance purposes. These are not cell creation commands.
