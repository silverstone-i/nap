# nap

NAP is a hobby project that I have long wanted to do. Rather than spend an
inordinate amount of time figuring out what to name the project I went with
Not Another Program (NAP), but if you prefer you can think of it as
Next-generation Accounting Platform.

NAP is a horizontal, project-native, multi-company ERP. The base ERP core
includes multi-tenant infrastructure, RBAC, master data, projects, activities,
AP/AR, double-entry accounting, cashflow, and profitability. The initial
release focuses on construction-industry workflows.

## Stack

NAP uses PostgreSQL, Express, React, and Node.

## Documentation

The active documentation set is being rebuilt around focused architecture
guides:

- [BFF](docs/architecture/bff.md)
- [Admin and cells](docs/architecture/admin-cells.md)
- [Migration strategy](docs/architecture/migrations.md)
- [Module design](docs/architecture/module-design.md)
- [Module map](docs/architecture/module-map.md)

The previous documentation is no longer part of the tracked repository. An
ignored local `reference-material/` archive may exist for historical research,
but it is not current implementation authority.

## Development

Use the package scripts in `package.json` for local development and
verification.

## License

Released under the GNU Affero General Public License, version 3 or later
(AGPL-3.0-or-later). See LICENSE.

If you run a modified version of NAP over a network, you must make the modified
source available to your users. This is intentional: NAP is open
infrastructure.

## Contributing

Contributions are welcome. Every commit must carry a Signed-off-by: trailer
asserting the Developer Certificate of Origin (DCO 1.1). See COLLABORATION.md
for details and the dependency policy.

The maintainer (Ian Silverstone) has sole enforcement authority over project
policy.

## Copyright

Copyright (c) 2026-present NapSoft, LLC. All contributors retain copyright in
their contributions, licensed to the project under AGPL-3.0-or-later via the
DCO sign-off.
