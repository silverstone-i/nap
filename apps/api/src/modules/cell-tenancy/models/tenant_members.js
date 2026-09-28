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
    { name: 'status', type: 'text', notNull: true },
    { name: 'revision', type: 'integer', notNull: true },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: [
      "member_type IS NULL OR member_type IN ('employee', 'client', 'vendor_contact', 'contact')",
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
        columns: ['portal_user_id', 'tenant_id'],
        unique: true,
        where: 'deactivated_at IS NULL',
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
    'status',
  ];
  constructor(db, pgp, logger) {
    super(db, pgp, tenantMembersSchema, logger);
  }

  /**
   * A portal user's membership status in the tenant (`pending`, `active`, or
   * `suspended`), or `null` when there is no unarchived membership. Read
   * inside the caller's transaction (M0003 §10).
   * @param {string} tenantId
   * @param {string} portalUserId
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<string|null>}
   */
  async membershipStatus(tenantId, portalUserId, { tx }) {
    const row = await tx.oneOrNone(
      `SELECT status FROM ${this.schemaName}.${this.tableName}
        WHERE tenant_id=$1 AND portal_user_id=$2 AND deactivated_at IS NULL`,
      [tenantId, portalUserId]
    );
    return row?.status ?? null;
  }
}
