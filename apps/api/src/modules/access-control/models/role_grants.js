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

  /**
   * Patterns for several roles, keyed by role ID, each sorted.
   * @param {string[]} roleIds
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<Map<string, string[]>>}
   */
  async patternsByRole(roleIds, { tx }) {
    const byRole = new Map(roleIds.map(id => [id, []]));
    if (roleIds.length === 0) return byRole;
    const rows = await tx.any(
      `SELECT role_id, pattern FROM ${this.schemaName}.${this.tableName}
        WHERE role_id = ANY($1::uuid[]) ORDER BY pattern`,
      [roleIds]
    );
    for (const row of rows) byRole.get(row.role_id)?.push(row.pattern);
    return byRole;
  }

  /**
   * Replace a role's grants with `patterns` (M0003 §10: `grants` replaces the
   * full set). Grants carry no history of their own; the administrative
   * event records the before and after sets (M0003-R015).
   * @param {{tenantId: string, roleId: string, actorId: string}} role
   * @param {string[]} patterns Distinct, validated patterns.
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<void>}
   */
  async replaceFor({ tenantId, roleId, actorId }, patterns, { tx }) {
    await tx.none(
      `DELETE FROM ${this.schemaName}.${this.tableName}
        WHERE role_id=$1 AND NOT (pattern = ANY($2::text[]))`,
      [roleId, patterns]
    );
    await tx.none(
      `INSERT INTO ${this.schemaName}.${this.tableName}
              (tenant_id, role_id, pattern, created_by, updated_by)
       SELECT $1, $2, p, $4, $4 FROM unnest($3::text[]) AS p
       ON CONFLICT (role_id, pattern) DO NOTHING`,
      [tenantId, roleId, patterns, actorId]
    );
  }

  /**
   * A portal user's resolved pattern set in this tenant (I0005-R004): the
   * distinct grants of the user's active assignments on active roles.
   * Archived roles and archived assignments contribute nothing.
   * @param {string} portalUserId
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<string[]>} Sorted patterns.
   */
  async patternsForUser(portalUserId, { tx }) {
    const rows = await tx.any(
      `SELECT DISTINCT g.pattern
         FROM ${this.schemaName}.${this.tableName} g
         JOIN app.roles r ON r.id = g.role_id AND r.deactivated_at IS NULL
         JOIN app.role_assignments a
           ON a.role_id = r.id AND a.deactivated_at IS NULL
        WHERE a.portal_user_id = $1
        ORDER BY g.pattern`,
      [portalUserId]
    );
    return rows.map(row => row.pattern);
  }
}
