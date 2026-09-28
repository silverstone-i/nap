/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

/**
 * Schema object for `app.role_grants`: one capability pattern on a role
 * (M0003-R002, R003). Kept identical to the copy frozen in migration
 * `001-access-control`.
 */
export const roleGrantsSchema = {
  dbSchema: 'app',
  table: 'role_grants',
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
    { name: 'role_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'pattern', type: 'varchar(255)', notNull: true, immutable: true },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['role_id', 'pattern']],
    checks: [
      "pattern ~ '^([A-Z0-9_-]+|\\*)::([a-z0-9-]+|\\*)::([a-z0-9-]+|\\*)::([a-z0-9-]+|\\*)$'",
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['tenant_id', 'role_id'],
        references: {
          schema: 'app',
          table: 'roles',
          columns: ['tenant_id', 'id'],
        },
        onDelete: 'RESTRICT',
      },
    ],
  },
};

/** Model for `app.role_grants`. Subject to the tenant row-level security rule. */
export class RoleGrants extends TableModel {
  static schema = roleGrantsSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, roleGrantsSchema, logger);
  }

  /**
   * A role's patterns, sorted.
   * @param {string} roleId
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<string[]>}
   */
  async patternsFor(roleId, { tx }) {
    const rows = await tx.any(
      `SELECT pattern FROM ${this.schemaName}.${this.tableName}
        WHERE role_id=$1 ORDER BY pattern`,
      [roleId]
    );
    return rows.map(row => row.pattern);
  }
}
