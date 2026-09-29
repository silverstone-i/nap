/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { defineMigration, TableModel } from 'pg-schemata';

/**
 * Baseline `reference-data` migration (M0004). It creates the three
 * `reference` tables and grants `nap-app` read-only access: rows change
 * only through the versioned seed, which runs as `nap-admin`.
 *
 * Schema objects are copied here rather than imported so the migration
 * checksum covers the whole contract. Do not edit after this migration has
 * been applied to a persistent environment; add a new migration instead.
 */
export const migration = defineMigration({
  id: '001-reference-data',
  up: async ({ db, pgp }) => {
    const countriesSchema = {
      dbSchema: 'reference',
      table: 'countries',
      columns: [
        { name: 'code', type: 'char(2)', notNull: true, immutable: true },
        { name: 'alpha3', type: 'char(3)', notNull: true },
        { name: 'numeric_code', type: 'char(3)', notNull: true },
        { name: 'name', type: 'text', notNull: true },
      ],
      constraints: {
        primaryKey: ['code'],
        unique: [['alpha3'], ['numeric_code']],
        checks: [
          "code ~ '^[A-Z]{2}$'",
          "alpha3 ~ '^[A-Z]{3}$'",
          "numeric_code ~ '^[0-9]{3}$'",
        ],
      },
    };
    const currenciesSchema = {
      dbSchema: 'reference',
      table: 'currencies',
      columns: [
        { name: 'code', type: 'char(3)', notNull: true, immutable: true },
        { name: 'numeric_code', type: 'char(3)', notNull: true },
        { name: 'name', type: 'text', notNull: true },
        { name: 'minor_unit', type: 'smallint', notNull: true },
      ],
      constraints: {
        primaryKey: ['code'],
        unique: [['numeric_code']],
        checks: [
          "code ~ '^[A-Z]{3}$'",
          "numeric_code ~ '^[0-9]{3}$'",
          'minor_unit BETWEEN 0 AND 4',
        ],
      },
    };
    const seedVersionsSchema = {
      dbSchema: 'reference',
      table: 'seed_versions',
      columns: [
        { name: 'version', type: 'integer', notNull: true, immutable: true },
        {
          name: 'applied_at',
          type: 'timestamptz',
          notNull: true,
          default: 'now()',
        },
      ],
      constraints: { primaryKey: ['version'], checks: ['version > 0'] },
    };
    for (const schema of [
      countriesSchema,
      currenciesSchema,
      seedVersionsSchema,
    ]) {
      await new TableModel(db, pgp, schema).createTable();
      await db.none('REVOKE ALL ON reference.$1:name FROM PUBLIC, "nap-app"', [
        schema.table,
      ]);
      await db.none('GRANT SELECT ON reference.$1:name TO "nap-app"', [
        schema.table,
      ]);
    }
    await db.none(
      'REVOKE ALL ON SCHEMA reference FROM PUBLIC; GRANT USAGE ON SCHEMA reference TO "nap-app"; REVOKE ALL ON reference.schema_migrations FROM PUBLIC, "nap-app";'
    );
  },
});
