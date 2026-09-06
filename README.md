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

The API currently returns empty 404 responses and the web displays NAP. Neither
requires a database to start. Transport contracts, health endpoints, and product
screens are later capabilities.

Copy `apps/api/.env.example` to `apps/api/.env` for local configuration. The API
and database setup load that file without overriding inherited environment values.
Only `PORT` and the development/test setup settings are implemented in this slice;
other sample settings remain proposals. Never commit the local environment file.

### Database setup and checks

Install PostgreSQL 18 or later, including `psql`, `initdb`, and `pg_ctl` on PATH.
On macOS, Homebrew's `postgresql@18` provides these commands. Use an existing
administrative login with permission to create roles and databases for setup.
Set the `_DEV` connection settings and runtime role names in the example, then
run `npm run db:setup:dev`. Use `_TEST` settings with `npm run db:setup:test`.
Both targets must share the setup server, and migration credentials must match
the setup owner. URLs must contain a password and no query parameters; database
and role identifiers use lowercase letters, digits, and underscores, starting
with a letter or underscore.

Setup creates missing databases and runtime roles, validates existing ownership
and privileges, and verifies credentials. It never resets passwords, drops data,
or creates application tables. Only `test` and `development` modes are supported.
Migration and bootstrap commands remain reserved for later capabilities.

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
