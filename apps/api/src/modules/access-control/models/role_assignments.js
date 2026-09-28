/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

/**
 * Schema object for `app.role_assignments`: a portal user holding a role in
 * the tenant (M0003-R006). `portal_user_id` is the admin portal user ID;
 * there is no cross-database foreign key. Kept identical to the copy frozen
 * in migration `001-access-control`.
 */
export const roleAssignmentsSchema = {
  dbSchema: 'app',
  table: 'role_assignments',
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
    { name: 'portal_user_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'role_id', type: 'uuid', notNull: true, immutable: true },
  ],
  constraints: {
    primaryKey: ['id'],
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
    indexes: [
      {
        columns: ['portal_user_id', 'role_id'],
        unique: true,
        where: 'deactivated_at IS NULL',
      },
      { columns: ['role_id'] },
    ],
  },
};

/** Model for `app.role_assignments`. Subject to the tenant row-level security rule. */
export class RoleAssignments extends TableModel {
  static schema = roleAssignmentsSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, roleAssignmentsSchema, logger);
  }

  /**
   * Lock and return a user's active assignment of a role, if any.
   * @param {string} portalUserId
   * @param {string} roleId
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<object|null>}
   */
  async lockActive(portalUserId, roleId, { tx }) {
    return tx.oneOrNone(
      `SELECT * FROM ${this.schemaName}.${this.tableName}
        WHERE portal_user_id=$1 AND role_id=$2 AND deactivated_at IS NULL
        FOR UPDATE`,
      [portalUserId, roleId]
    );
  }

  /**
   * IDs of the roles a user actively holds, archived roles included.
   * @param {string} portalUserId
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<string[]>}
   */
  async activeRoleIds(portalUserId, { tx }) {
    const rows = await tx.any(
      `SELECT role_id FROM ${this.schemaName}.${this.tableName}
        WHERE portal_user_id=$1 AND deactivated_at IS NULL`,
      [portalUserId]
    );
    return rows.map(row => row.role_id);
  }

  /**
   * Count a role's active assignments held by active members of the tenant
   * (M0003-R012): the member row in `cell.tenant_members` is `active` and not
   * archived. The caller locks the role first so concurrent removals of the
   * same role see each other.
   * @param {string} roleId
   * @param {string} tenantId
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<number>}
   */
  async countActive(roleId, tenantId, { tx }) {
    const row = await tx.one(
      `SELECT count(*)::int AS n
         FROM ${this.schemaName}.${this.tableName} AS assignment
         JOIN cell.tenant_members AS member
           ON member.tenant_id = assignment.tenant_id
          AND member.portal_user_id = assignment.portal_user_id
        WHERE assignment.role_id=$1 AND assignment.tenant_id=$2
          AND assignment.deactivated_at IS NULL
          AND member.status='active' AND member.deactivated_at IS NULL`,
      [roleId, tenantId]
    );
    return row.n;
  }

  /**
   * Archive one assignment, recording who removed it.
   * @param {string} id
   * @param {string} actorId
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<void>}
   */
  async archive(id, actorId, { tx }) {
    await tx.none(
      `UPDATE ${this.schemaName}.${this.tableName}
          SET deactivated_at = now(), updated_by = $2
        WHERE id=$1 AND deactivated_at IS NULL`,
      [id, actorId]
    );
  }
}
