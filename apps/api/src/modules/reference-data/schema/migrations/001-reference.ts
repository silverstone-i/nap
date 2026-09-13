/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { defineMigration, TableModel } from 'pg-schemata';
/** Does: Creates frozen shared ISO catalogs and a seed ledger. Called by: cell migrations. */
export const migration = defineMigration({
  id: '001-reference',
  up: async ({ db, pgp }) => {
    await new TableModel(db, pgp, {
      dbSchema: 'reference',
      table: 'countries',
      hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
      softDelete: false,
      columns: [
        { name: 'code', type: 'text', notNull: true },
        { name: 'alpha3', type: 'text', notNull: true },
        { name: 'numeric', type: 'text', notNull: true },
        { name: 'name', type: 'text', notNull: true },
      ],
      constraints: {
        primaryKey: ['code'],
        unique: [['alpha3'], ['numeric']],
        checks: [
          "code ~ '^[A-Z]{2}$'",
          "alpha3 ~ '^[A-Z]{3}$'",
          "numeric ~ '^[0-9]{3}$'",
        ],
      },
    }).createTable();
    await new TableModel(db, pgp, {
      dbSchema: 'reference',
      table: 'currencies',
      hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
      softDelete: false,
      columns: [
        { name: 'code', type: 'text', notNull: true },
        { name: 'numeric', type: 'text' },
        { name: 'name', type: 'text', notNull: true },
        { name: 'minor_units', type: 'integer' },
      ],
      constraints: {
        primaryKey: ['code'],
        checks: [
          "code ~ '^[A-Z]{3}$'",
          "numeric ~ '^[0-9]{3}$'",
          'minor_units BETWEEN 0 AND 9',
        ],
      },
    }).createTable();
    await db.none(`ALTER TABLE reference.countries ALTER COLUMN created_at SET NOT NULL,ALTER COLUMN updated_at SET NOT NULL;
  ALTER TABLE reference.currencies ALTER COLUMN created_at SET NOT NULL,ALTER COLUMN updated_at SET NOT NULL;
  CREATE TABLE reference.seed_versions(version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT transaction_timestamp());`);
  },
});
