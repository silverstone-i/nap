/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

/**
 * Schema object for `admin.cache_revisions`: a monotonic revision per cache dependency key.
 * Kept identical to the copy frozen in migration `001-admin-tenancy`.
 */
export const cacheRevisionsSchema = {
  dbSchema: 'admin',
  table: 'cache_revisions',
  columns: [
    { name: 'domain', type: 'text', notNull: true, immutable: true },
    { name: 'entity', type: 'text', notNull: true, immutable: true },
    { name: 'revision', type: 'bigint', notNull: true, default: 1 },
    {
      name: 'updated_at',
      type: 'timestamptz',
      notNull: true,
      default: 'now()',
    },
  ],
  constraints: {
    primaryKey: ['domain', 'entity'],
    checks: ['revision > 0'],
  },
};

/** Model for `admin.cache_revisions`. Inherits the standard table operations only. */
export class CacheRevisions extends TableModel {
  static schema = cacheRevisionsSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, cacheRevisionsSchema, logger);
  }
}
