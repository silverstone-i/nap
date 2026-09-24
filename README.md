# NAP

NAP means Not Another Program or Next-generation Accounting Platform. It is a
project-native, multi-company ERP for construction workflows.

The core includes:

- Multi-tenant infrastructure
- Role-based access control
- Master data
- Projects and activities
- Accounts payable and receivable
- Double-entry accounting
- Cash flow and profitability

## Stack

- PostgreSQL
- Express
- React
- Node.js

## Repository layout

| Path                 | Contents                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| `apps/api/`          | Express backend-for-frontend and database maintenance commands. See its [README](apps/api/README.md). |
| `apps/web/`          | React web client built with Vite. See its [README](apps/web/README.md).                               |
| `packages/shared/`   | Transport contracts shared by the API and web client. See its [README](packages/shared/README.md).    |
| `scripts/`           | License, release, and roadmap checks run by npm and CI. See its [README](scripts/README.md).          |
| `docs/`              | Architecture, PRDs, guides, roadmap, and branding.                                                    |
| `.github/workflows/` | CI, changelog check, roadmap check, and release on merge.                                             |
| `render.yaml`        | Render Blueprint for the production API service.                                                      |

## Documentation

Architecture:

- [BFF](docs/architecture/bff.md)
- [Admin and cells](docs/architecture/admin-cells.md)
- [Migration strategy](docs/architecture/migrations.md)
- [Module design](docs/architecture/module-design.md)
- [Module map](docs/architecture/module-map.md)

Requirements and delivery:

- [PRD guide](docs/PRDs/README.md) and [template](docs/PRDs/TEMPLATE.md)
- [Module PRDs](docs/PRDs/modules/), [feature PRDs](docs/PRDs/features/), and [workflow PRDs](docs/PRDs/workflows/)
- [Roadmap](docs/roadmap/ROADMAP.md)

Setup guides:

- [Development setup](docs/guides/development-setup.md)
- [Render production setup](docs/guides/production-setup.md)

The tracked documentation is authoritative. Any ignored `reference-material/`
archive is historical only.

## Development

Install the Node version in `.nvmrc`, then `npm ci`. The
[development setup](docs/guides/development-setup.md) guide covers PostgreSQL,
roles, and the private `apps/api/.env` file.

| Command                                 | Purpose                                                      |
| --------------------------------------- | ------------------------------------------------------------ |
| `npm run dev:api`                       | API on port 3000 with file watching.                         |
| `npm run dev:web`                       | Vite dev server proxying `/api` to the API.                  |
| `npm run db:setup:admin -- --env dev`   | Create or verify the admin database and roles.               |
| `npm run db:migrate:admin -- --env dev` | Apply admin migrations and verify the contract.              |
| `npm run db:bootstrap -- --env dev`     | Create the root tenant and root user from `ROOT_*` settings. |
| `npm run test:db`                       | PostgreSQL integration tests on a disposable server.         |

Setup and migration install the empty admin foundation; `db:bootstrap` then
creates the root tenant and root user.

Run these checks before requesting review:

```sh
npm run lint
npm run format:check
npm test
npm run build
npm run licenses
```

## License

NAP is licensed under the GNU Affero General Public License, version 3 or later
(AGPL-3.0-or-later). See [LICENSE](LICENSE).

If you run a modified version of NAP over a network, you must make the modified
source available to your users.

## Contributing

Every commit must include a `Signed-off-by` trailer asserting the Developer
Certificate of Origin 1.1. See [COLLABORATION.md](COLLABORATION.md) for the
contribution and dependency rules. Pull requests follow the release contract
in [scripts/README.md](scripts/README.md).

The maintainer (Ian Silverstone) has sole enforcement authority over project
rules.

## Copyright

Copyright (c) 2026-present NapSoft, LLC. All contributors retain copyright in
their contributions, licensed to the project under AGPL-3.0-or-later via the
DCO sign-off.
