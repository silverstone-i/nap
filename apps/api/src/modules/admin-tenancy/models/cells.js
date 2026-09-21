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

/**
 * Qualified table name for a model instance.
 *
 * A module function rather than a private getter: `forSchema` clones a model
 * with `Object.create`, which does not carry private fields.
 * @param {Cells} model
 * @returns {string}
 */
function table(model) {
  return `${model.schemaName}.${model.tableName}`;
}

/** Model for `admin.cells`. Adds the registration conflict check. */
export class Cells extends TableModel {
  static schema = cellsSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, cellsSchema, logger);
  }

  /**
   * Find the active (unarchived) cell registered under an environment and
   * database name, if any.
   *
   * Read inside the caller's transaction, under the registration advisory
   * lock, so a second registration racing for the same identity observes the
   * first one's committed row rather than a stale pool read.
   * @param {string} environment
   * @param {string} databaseName
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<object|null>}
   */
  async findActiveByIdentity(environment, databaseName, { tx }) {
    return tx.oneOrNone(
      `SELECT * FROM ${table(this)} WHERE environment=$1 AND database_name=$2 AND deactivated_at IS NULL`,
      [environment, databaseName]
    );
  }
}
