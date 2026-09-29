/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

/**
 * Schema object for `reference.seed_versions`: one applied seed version
 * (M0004-R003). Kept identical to the copy frozen in migration
 * `001-reference-data`.
 */
export const seedVersionsSchema = {
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

/** Model for `reference.seed_versions`. `nap-app` may only read it. */
export class SeedVersions extends TableModel {
  static schema = seedVersionsSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, seedVersionsSchema, logger);
  }
}
