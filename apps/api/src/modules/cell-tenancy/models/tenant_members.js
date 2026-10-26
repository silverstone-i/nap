/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { CopyTableModel } from './copyTableModel.js';

/**
 * Schema object for `cell.tenant_members`: a copy of `admin.portal_user_tenants` for the tenants in this cell.
 * Kept identical to the copy frozen in migration `001-cell-tenancy`.
 */
export const tenantMembersSchema = {
  dbSchema: 'cell',
  table: 'tenant_members',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', notNull: true, immutable: true },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'portal_user_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'member_type', type: 'text' },
    { name: 'member_id', type: 'uuid' },
    { name: 'member_label', type: 'text' },
    { name: 'status', type: 'text', notNull: true },
    { name: 'revision', type: 'integer', notNull: true },
  ],
  constraints: {
    primaryKey: ['id'],
    // Lets a tenant table key to a membership of the same tenant (M0006-03).
    unique: [['tenant_id', 'id']],
    checks: [
      "member_type IS NULL OR member_type IN ('employee', 'contact', 'vendor_contact', 'client_contact')",
      "status IN ('pending', 'active', 'suspended')",
      'revision > 0',
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['tenant_id'],
        references: { schema: 'cell', table: 'tenants', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [
      {
        columns: ['portal_user_id', 'tenant_id', 'member_id'],
        unique: true,
        where: 'deactivated_at IS NULL',
      },
      {
        columns: ['portal_user_id', 'tenant_id'],
        unique: true,
        where: 'member_id IS NULL AND deactivated_at IS NULL',
      },
      { columns: ['tenant_id', 'member_id'] },
    ],
  },
};

/** Model for `cell.tenant_members`: a copy kept in step by the sync worker (I0004). */
export class TenantMembers extends CopyTableModel {
  static schema = tenantMembersSchema;
  static copyColumns = [
    'tenant_id',
    'portal_user_id',
    'member_type',
    'member_id',
    'member_label',
    'status',
  ];
  constructor(db, pgp, logger) {
    super(db, pgp, tenantMembersSchema, logger);
  }

  /**
   * Unarchived memberships whose `member_id` is one of `memberIds`, the
   * directory people they belong to (I0008-R005, R006, R008).
   * @param {string} tenantId
   * @param {string[]} memberIds
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<{id: string, member_id: string, portal_user_id: string, status: string}[]>}
   */
  async byMemberIds(tenantId, memberIds, { tx }) {
    if (memberIds.length === 0) return [];
    return tx.any(
      `SELECT id, member_id, portal_user_id, status
         FROM ${this.schemaName}.${this.tableName}
        WHERE tenant_id=$1 AND member_id = ANY($2::uuid[])
          AND deactivated_at IS NULL`,
      [tenantId, memberIds]
    );
  }

  /**
   * One unarchived membership of the tenant by ID, or `null`. Cell tables
   * have no row-level security, so the tenant is filtered here.
   * @param {string} tenantId
   * @param {string} id The membership ID.
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<{id: string, portal_user_id: string, member_type: string|null, member_id: string|null, member_label: string|null, status: string}|null>}
   */
  async byId(tenantId, id, { tx }) {
    return tx.oneOrNone(
      `SELECT id, portal_user_id, member_type, member_id, member_label, status
         FROM ${this.schemaName}.${this.tableName}
        WHERE tenant_id=$1 AND id=$2 AND deactivated_at IS NULL`,
      [tenantId, id]
    );
  }
}
