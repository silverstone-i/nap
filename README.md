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

## Documentation

Architecture guides:

- [BFF](docs/architecture/bff.md)
- [Admin and cells](docs/architecture/admin-cells.md)
- [Migration strategy](docs/architecture/migrations.md)
- [Module design](docs/architecture/module-design.md)
- [Module map](docs/architecture/module-map.md)

The tracked documentation is authoritative. Any ignored `reference-material/`
archive is historical only.

## Development

Use the package scripts in `package.json` for local development and
verification.

## License

NAP is licensed under the GNU Affero General Public License, version 3 or later
(AGPL-3.0-or-later). See [LICENSE](LICENSE).

If you run a modified version of NAP over a network, you must make the modified
source available to your users.

## Contributing

Every commit must include a `Signed-off-by` trailer asserting the Developer
Certificate of Origin 1.1. See [COLLABORATION.md](COLLABORATION.md) for the
contribution and dependency rules.

The maintainer (Ian Silverstone) has sole enforcement authority over project
rules.

## Copyright

Copyright (c) 2026-present NapSoft, LLC. All contributors retain copyright in
their contributions, licensed to the project under AGPL-3.0-or-later via the
DCO sign-off.

## Database setup

- [Development setup](docs/guides/development-setup.md)
- [Render production setup](docs/guides/production-setup.md)

Setup and migration install the empty Admin foundation. Root bootstrap, login,
and cell provisioning belong to later Work Units.
