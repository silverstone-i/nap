/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

/**
 * Schema object for `admin.provisioning_jobs`: requests to create a membership's member record in the tenant's cell.
 * Kept identical to the copy frozen in migration `001-admin-tenancy`.
 */
export const provisioningJobsSchema = {
  dbSchema: 'admin',
  table: 'provisioning_jobs',
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
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'membership_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'kind', type: 'text', notNull: true, immutable: true },
    { name: 'status', type: 'text', notNull: true, default: 'queued' },
    { name: 'attempts', type: 'integer', notNull: true, default: 0 },
    { name: 'result_member_id', type: 'uuid' },
    { name: 'failure_code', type: 'varchar(64)' },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: [
      "kind IN ('employee', 'client', 'vendor', 'contact')",
      "status IN ('queued', 'running', 'failed', 'completed')",
      'attempts >= 0',
      "(status = 'completed' AND result_member_id IS NOT NULL AND failure_code IS NULL) OR status <> 'completed'",
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
        columns: ['membership_id'],
        references: {
          schema: 'admin',
          table: 'portal_user_tenants',
          columns: ['id'],
        },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [
      {
        columns: ['membership_id'],
        unique: true,
        where: "deactivated_at IS NULL AND status IN ('queued', 'running')",
      },
      { columns: ['status'] },
    ],
  },
};

/**
 * Qualified table name for a model instance. See `sessions.js` for why this
 * is a module function rather than a private getter.
 * @param {ProvisioningJobs} model
 * @returns {string}
 */
function table(model) {
  return `${model.schemaName}.${model.tableName}`;
}

/**
 * Model for `admin.provisioning_jobs`. Adds the locked read retry and the
 * internal result report need, so two concurrent callers cannot both advance
 * a job from what they each believed was its current state.
 */
export class ProvisioningJobs extends TableModel {
  static schema = provisioningJobsSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, provisioningJobsSchema, logger);
  }

  /**
   * Lock and return a provisioning job by identifier, archived or not.
   * @param {string} id
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<object|null>}
   */
  async lockById(id, { tx }) {
    return tx.oneOrNone(`SELECT * FROM ${table(this)} WHERE id=$1 FOR UPDATE`, [
      id,
    ]);
  }
}
