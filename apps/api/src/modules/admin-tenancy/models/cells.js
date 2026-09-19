/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

/**
 * Schema object for `admin.cells`: registered cell databases and whether each may receive tenant traffic.
 * Kept identical to the copy frozen in migration `001-admin-tenancy`.
 */
export const cellsSchema = {
  dbSchema: 'admin',
  table: 'cells',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  softDelete: true,
  columns: [
    {
      name: 'id',
      type: 'uuid',
      notNull: true,
      default: 'gen_random_uuid()',
      immutable: true,
    },
    { name: 'environment', type: 'text', notNull: true, immutable: true },
    {
      name: 'database_name',
      type: 'varchar(63)',
      notNull: true,
      immutable: true,
    },
    { name: 'enabled', type: 'boolean', notNull: true, default: false },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: ["environment IN ('dev', 'test', 'prod')"],
    indexes: [
      {
        columns: ['environment', 'database_name'],
        unique: true,
        where: 'deactivated_at IS NULL',
      },
    ],
  },
};

/** Model for `admin.cells`. Inherits the standard table operations only. */
export class Cells extends TableModel {
  static schema = cellsSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, cellsSchema, logger);
  }
}
