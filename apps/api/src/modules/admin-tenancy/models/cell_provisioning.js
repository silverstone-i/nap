/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

/**
 * Schema object for `admin.cell_provisioning`: one provisioning operation per cell: stage, status, attempts, and failure.
 * Kept identical to the copy frozen in migration `001-admin-tenancy`.
 */
export const cellProvisioningSchema = {
  dbSchema: 'admin',
  table: 'cell_provisioning',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  columns: [
    {
      name: 'id',
      type: 'uuid',
      notNull: true,
      default: 'gen_random_uuid()',
      immutable: true,
    },
    { name: 'cell_id', type: 'uuid', notNull: true, immutable: true },
    {
      name: 'operation_id',
      type: 'uuid',
      notNull: true,
      default: 'gen_random_uuid()',
      immutable: true,
    },
    {
      name: 'requested_action',
      type: 'text',
      notNull: true,
      default: 'provision',
    },
    { name: 'stage', type: 'text', notNull: true, default: 'registered' },
    { name: 'status', type: 'text', notNull: true, default: 'queued' },
    { name: 'attempts', type: 'integer', notNull: true, default: 0 },
    { name: 'failure_code', type: 'varchar(64)' },
    { name: 'started_at', type: 'timestamptz' },
    { name: 'completed_at', type: 'timestamptz' },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['cell_id'], ['operation_id']],
    checks: [
      "requested_action IN ('provision', 'activate')",
      "stage IN ('registered', 'setup', 'migration', 'seed', 'activation', 'complete')",
      "status IN ('queued', 'running', 'failed', 'completed')",
      'attempts >= 0',
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['cell_id'],
        references: { schema: 'admin', table: 'cells', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [{ columns: ['status', 'stage'] }],
  },
};

/**
 * Qualified table name for a model instance.
 *
 * A module function rather than a private getter: `forSchema` clones a model
 * with `Object.create`, which does not carry private fields.
 * @param {CellProvisioning} model
 * @returns {string}
 */
function table(model) {
  return `${model.schemaName}.${model.tableName}`;
}

/**
 * Model for `admin.cell_provisioning`. Adds the locked reads retry and the
 * runner's progress updates need — both change stage, status, and attempts
 * from a value read under the same lock, so two concurrent callers cannot
 * both advance the operation from what they each believed was its current
 * state.
 */
export class CellProvisioning extends TableModel {
  static schema = cellProvisioningSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, cellProvisioningSchema, logger);
  }

  /**
   * Lock and return the one provisioning operation registered for a cell.
   * @param {string} cellId
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<object|null>}
   */
  async lockByCellId(cellId, { tx }) {
    return tx.oneOrNone(
      `SELECT * FROM ${table(this)} WHERE cell_id=$1 FOR UPDATE`,
      [cellId]
    );
  }

  /**
   * Lock and return a provisioning operation by its retained operation
   * identifier, the identifier a runner tracks across retries.
   * @param {string} operationId
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<object|null>}
   */
  async lockByOperationId(operationId, { tx }) {
    return tx.oneOrNone(
      `SELECT * FROM ${table(this)} WHERE operation_id=$1 FOR UPDATE`,
      [operationId]
    );
  }
  /**
   * Lock and return the oldest queued operation, skipping rows another
   * transaction already holds, so two workers never claim the same job
   * (I0003-R004).
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<object|null>}
   */
  async lockNextQueued({ tx }) {
    return tx.oneOrNone(
      `SELECT * FROM ${table(this)} WHERE status='queued'
       ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED`
    );
  }

  /**
   * Whether any operation is `queued` or `running`, across every cell, so a
   * paginated screen can tell whether to keep refreshing (I0003-R030).
   * @returns {Promise<boolean>}
   */
  async hasActive() {
    const row = await this.db.one(
      `SELECT EXISTS(SELECT 1 FROM ${table(this)} WHERE status IN ('queued','running')) AS active`
    );
    return row.active;
  }

  /**
   * Return every `running` operation to `queued`, so a crashed or stopped
   * worker never strands a job (I0003-R002).
   * @returns {Promise<number>} Rows requeued.
   */
  async requeueRunning() {
    const result = await this.db.result(
      `UPDATE ${table(this)} SET status='queued' WHERE status='running'`
    );
    return result.rowCount;
  }
}
