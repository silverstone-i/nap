/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { RevisionedTableModel } from './revisionedTableModel.js';

/**
 * Schema object for `admin.tenants`: tenant registration, lifecycle, cell assignment, and readiness. `is_napsoft` marks the owning tenant.
 * Kept identical to the copy frozen in migration `001-admin-tenancy`.
 */
export const tenantsSchema = {
  dbSchema: 'admin',
  table: 'tenants',
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
    {
      name: 'tenant_code',
      type: 'varchar(32)',
      notNull: true,
      immutable: true,
    },
    { name: 'name', type: 'varchar(160)', notNull: true },
    { name: 'tier', type: 'text', notNull: true, default: 'starter' },
    { name: 'status', type: 'text', notNull: true, default: 'pending' },
    {
      name: 'is_napsoft',
      type: 'boolean',
      notNull: true,
      default: false,
      immutable: true,
    },
    { name: 'cell_id', type: 'uuid' },
    { name: 'provisioned', type: 'boolean', notNull: true, default: false },
    { name: 'rbac_ready', type: 'boolean', notNull: true, default: false },
    { name: 'revision', type: 'integer', notNull: true, default: 1 },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: [
      "tier IN ('starter', 'growth', 'enterprise')",
      "status IN ('pending', 'active', 'suspended')",
      'revision > 0',
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['cell_id'],
        references: { schema: 'admin', table: 'cells', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [
      {
        name: 'tenants_active_code',
        columns: [{ expression: 'lower(tenant_code)' }],
        unique: true,
        where: 'deactivated_at IS NULL',
      },
      { columns: ['is_napsoft'], unique: true, where: 'is_napsoft = true' },
      { columns: ['cell_id'] },
    ],
  },
};

/**
 * Qualified table name for a model instance.
 *
 * A module function rather than a private getter, for the reason given in
 * `sessions.js`: `forSchema` clones a model with `Object.create`, which does
 * not carry private fields.
 * @param {Tenants} model
 * @returns {string}
 */
function table(model) {
  return `${model.schemaName}.${model.tableName}`;
}

/** Model for `admin.tenants`. Adds the locked reads bootstrap needs. */
export class Tenants extends RevisionedTableModel {
  static schema = tenantsSchema;
  static revisionedColumns = ['tenant_code', 'status'];
  constructor(db, pgp, logger) {
    super(db, pgp, tenantsSchema, logger);
  }

  /**
   * Lock and return the owning tenant, if one has been bootstrapped.
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<object|null>}
   */
  async lockNapsoft({ tx }) {
    return tx.oneOrNone(
      `SELECT * FROM ${table(this)} WHERE is_napsoft=true AND deactivated_at IS NULL FOR UPDATE`
    );
  }

  /**
   * Lock and return the active tenant registered under `tenantCode`, if any.
   * @param {string} tenantCode
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<object|null>}
   */
  async lockActiveByCode(tenantCode, { tx }) {
    return tx.oneOrNone(
      `SELECT * FROM ${table(this)} WHERE lower(tenant_code)=lower($1) AND deactivated_at IS NULL FOR UPDATE`,
      [tenantCode]
    );
  }
}
