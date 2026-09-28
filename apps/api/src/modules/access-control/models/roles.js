/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

/**
 * Schema object for `app.roles`: named sets of capability patterns in one
 * tenant (M0003-R001). `(tenant_id, code)` is unique including archived roles.
 * Kept identical to the copy frozen in migration `001-access-control`.
 */
export const rolesSchema = {
  dbSchema: 'app',
  table: 'roles',
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
    { name: 'code', type: 'varchar(64)', notNull: true, immutable: true },
    { name: 'name', type: 'varchar(160)', notNull: true },
    { name: 'description', type: 'varchar(512)' },
    {
      name: 'is_immutable',
      type: 'boolean',
      notNull: true,
      default: false,
      immutable: true,
    },
    { name: 'revision', type: 'integer', notNull: true, default: 1 },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [
      ['tenant_id', 'code'],
      ['tenant_id', 'id'],
    ],
    checks: ['revision > 0'],
  },
};

/**
 * Model for `app.roles`. Row-level security limits every statement to the
 * tenant in `nap.tenant_id`, so callers pass the transaction that set it.
 */
export class Roles extends TableModel {
  static schema = rolesSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, rolesSchema, logger);
  }

  /**
   * Lock and return a tenant's role by code, archived or not.
   * @param {string} tenantId
   * @param {string} code
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<object|null>}
   */
  async lockByCode(tenantId, code, { tx }) {
    return tx.oneOrNone(
      `SELECT * FROM ${this.schemaName}.${this.tableName}
        WHERE tenant_id=$1 AND code=$2 FOR UPDATE`,
      [tenantId, code]
    );
  }
}
