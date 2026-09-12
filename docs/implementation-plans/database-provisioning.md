# Admin and cell database provisioning

Design: Accepted. Implementation: Implemented locally; not shipped.

Approved delivery: separate explicit-environment setup, migration, admin bootstrap,
cell reference seeding, and activation commands. DEV/TEST use local PostgreSQL;
PROD creates independent Render instances. Cell names are operator-supplied suffixes,
not allocated numbers. Registration precedes physical creation; durable identity
checks precede migration, seed, and activation. Recovery retains existing resources.

Replace the eight admin migrations with five frozen baseline migrations. Introduce
reference-data countries/currencies and a versioned redistributable seed snapshot.
Test suites own synthetic data. Update authoritative and operational documentation.

## Verification

Verified 2026-09-12:

- Full test suite: 458 passing (39 toolchain, 325 API, 80 web, 14 shared).
- Disposable PostgreSQL covers admin preparation without cells, bootstrap replay,
  named cells, physical identity checks, migrations, seed replay, and activation.
- Mocked Render requests cover uncertain creation reconciliation, safe diagnostics,
  deployment, and runtime configuration without maintenance passwords.
- Lint, typecheck, build, formatting, license checks (227 dependencies), and
  `git diff --check` passed.

No user DEV/PROD databases or Render resources were provisioned or changed. Live
Render execution remains unverified and requires separate authorization. Uncertain
creation/deployment outcomes that cannot be reconciled safely require operator
inspection; see the [recovery instructions](../guides/database-provisioning.md).
Changes are local and uncommitted.
