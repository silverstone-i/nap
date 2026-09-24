/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

/**
 * Schema object for `cell.physical_identity`: the one row naming which registered cell this database is. Setup writes it once.
 * Kept identical to the copy frozen in migration `001-cell-tenancy`.
 */
export const physicalIdentitySchema = {
  dbSchema: 'cell',
  table: 'physical_identity',
  columns: [
    { name: 'cell_id', type: 'uuid', notNull: true, immutable: true },
    {
      name: 'database_name',
      type: 'varchar(63)',
      notNull: true,
      immutable: true,
    },
    { name: 'operation_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'environment', type: 'text', notNull: true, immutable: true },
    {
      name: 'created_at',
      type: 'timestamptz',
      notNull: true,
      default: 'now()',
      immutable: true,
    },
  ],
  constraints: {
    primaryKey: ['cell_id'],
    checks: ["environment IN ('dev', 'test', 'prod')"],
    indexes: [
      {
        name: 'physical_identity_single_row',
        columns: [{ expression: '(true)' }],
        unique: true,
      },
    ],
  },
};

/** Model for `cell.physical_identity`. Inherits the standard table operations only. */
export class PhysicalIdentity extends TableModel {
  static schema = physicalIdentitySchema;
  constructor(db, pgp, logger) {
    super(db, pgp, physicalIdentitySchema, logger);
  }
}
