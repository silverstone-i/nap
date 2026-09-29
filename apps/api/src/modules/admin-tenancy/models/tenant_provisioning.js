/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

/**
 * Schema object for `admin.tenant_provisioning`: one provisioning job per
 * customer tenant: target cell, first administrator, stage, status,
 * attempts, and failure (I0006).
 * Kept identical to the copy frozen in migration `001-admin-tenancy`.
 */
export const tenantProvisioningSchema = {
  dbSchema: 'admin',
  table: 'tenant_provisioning',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  columns: [
    {
      name: 'id',
      type: 'uuid',
      notNull: true,
      default: 'gen_random_uuid()',
      immutable: true,
    },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'cell_id', type: 'uuid', notNull: true, immutable: true },
    {
      name: 'admin_membership_id',
      type: 'uuid',
      notNull: true,
      immutable: true,
    },
    // M0005-R021: the first administrator's name for the directory seed.
    {
      name: 'admin_first_name',
      type: 'varchar(160)',
      notNull: true,
      immutable: true,
    },
    {
      name: 'admin_last_name',
      type: 'varchar(160)',
      notNull: true,
      immutable: true,
    },
    { name: 'stage', type: 'text', notNull: true, default: 'assignment' },
    { name: 'status', type: 'text', notNull: true, default: 'queued' },
    { name: 'attempts', type: 'integer', notNull: true, default: 0 },
    { name: 'failure_code', type: 'varchar(64)' },
    { name: 'started_at', type: 'timestamptz' },
    { name: 'completed_at', type: 'timestamptz' },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['tenant_id']],
    checks: [
      "stage IN ('assignment', 'seed', 'activation', 'complete')",
      "status IN ('queued', 'running', 'failed', 'completed')",
      'attempts >= 0',
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['tenant_id'],
        references: { schema: 'admin', table: 'tenants', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['cell_id'],
        references: { schema: 'admin', table: 'cells', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['admin_membership_id'],
        references: {
          schema: 'admin',
          table: 'portal_user_tenants',
          columns: ['id'],
        },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [{ columns: ['status', 'stage'] }],
  },
};

/**
 * Qualified table name for a model instance (see `cell_provisioning.js`).
 * @param {TenantProvisioning} model
 * @returns {string}
 */
function table(model) {
  return `${model.schemaName}.${model.tableName}`;
}

/**
 * Model for `admin.tenant_provisioning`. Locked reads let the operations and
 * the worker change stage and status from a value read under the same lock.
 */
export class TenantProvisioning extends TableModel {
  static schema = tenantProvisioningSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, tenantProvisioningSchema, logger);
  }

  /**
   * Lock and return a tenant's provisioning job.
   * @param {string} tenantId
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<object|null>}
   */
  async lockByTenantId(tenantId, { tx }) {
    return tx.oneOrNone(
      `SELECT * FROM ${table(this)} WHERE tenant_id=$1 FOR UPDATE`,
      [tenantId]
    );
  }

  /**
   * Lock and return the oldest queued job, skipping rows another transaction
   * holds, so two workers never claim the same job (I0006-R005).
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
   * Whether any job is `queued` or `running`, so the Tenants screen can tell
   * whether to keep refreshing (I0006-R011).
   * @returns {Promise<boolean>}
   */
  async hasActive() {
    return this.exists({ status: { $in: ['queued', 'running'] } });
  }

  /**
   * Return every `running` job to `queued`, so a stopped worker never strands
   * one (I0006-R005).
   * @returns {Promise<number>} Rows requeued.
   */
  async requeueRunning() {
    return this.updateWhere({ status: 'running' }, { status: 'queued' });
  }
}
