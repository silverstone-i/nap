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

/** Model for `cell.physical_identity`. */
export class PhysicalIdentity extends TableModel {
  static schema = physicalIdentitySchema;
  constructor(db, pgp, logger) {
    super(db, pgp, physicalIdentitySchema, logger);
  }

  /**
   * Write the cell's one identity row (I0003-R008).
   *
   * The inherited `insert` always adds `created_by` and `updated_by`, which
   * this audit-free table does not have, so the row is written explicitly.
   * @param {{cell_id: string, database_name: string, operation_id: string, environment: string}} identity
   * @param {{tx?: import('pg-promise').IDatabase<unknown>}} [options]
   * @returns {Promise<void>}
   */
  async record(identity, { tx } = {}) {
    await (tx ?? this.db).none(
      `INSERT INTO cell.physical_identity(cell_id,database_name,operation_id,environment)
       VALUES($1,$2,$3,$4)`,
      [
        identity.cell_id,
        identity.database_name,
        identity.operation_id,
        identity.environment,
      ]
    );
  }
}
