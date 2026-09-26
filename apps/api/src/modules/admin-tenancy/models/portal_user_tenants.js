/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { RevisionedTableModel } from './revisionedTableModel.js';

/**
 * Schema object for `admin.portal_user_tenants`: portal-user to tenant memberships. `member_id` holds the member's UUID in the tenant's cell and is not a foreign key.
 * Kept identical to the copy frozen in migration `001-admin-tenancy`.
 */
export const portalUserTenantsSchema = {
  dbSchema: 'admin',
  table: 'portal_user_tenants',
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
    { name: 'portal_user_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'member_type', type: 'text' },
    { name: 'status', type: 'text', notNull: true, default: 'pending' },
    { name: 'member_id', type: 'uuid' },
    { name: 'ready', type: 'boolean', notNull: true, default: false },
    { name: 'revision', type: 'integer', notNull: true, default: 1 },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: [
      "member_type IS NULL OR member_type IN ('employee', 'client', 'vendor_contact', 'contact')",
      "status IN ('pending', 'active', 'suspended')",
      'revision > 0',
      "(member_type IS NULL AND status = 'active' AND ready = true AND member_id IS NULL) OR (member_type IS NOT NULL AND (ready = false OR (status = 'active' AND member_id IS NOT NULL)))",
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['portal_user_id'],
        references: { schema: 'admin', table: 'portal_users', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['tenant_id'],
        references: { schema: 'admin', table: 'tenants', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [
      {
        columns: ['portal_user_id', 'tenant_id'],
        unique: true,
        where: 'deactivated_at IS NULL',
      },
      { columns: ['tenant_id', 'status'] },
    ],
  },
};

/**
 * Qualified table name for a model instance. See `sessions.js` for why this
 * is a module function rather than a private getter.
 * @param {PortalUserTenants} model
 * @returns {string}
 */
function table(model) {
  return `${model.schemaName}.${model.tableName}`;
}

/** Model for `admin.portal_user_tenants`. Adds the locked read bootstrap needs. */
export class PortalUserTenants extends RevisionedTableModel {
  static schema = portalUserTenantsSchema;
  static revisionedColumns = [
    'portal_user_id',
    'tenant_id',
    'member_type',
    'member_id',
    'status',
  ];
  static outboxTopic = 'membership';
  static snapshot(row) {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      portal_user_id: row.portal_user_id,
      member_type: row.member_type,
      member_id: row.member_id,
      status: row.status,
      deactivated_at: row.deactivated_at ?? null,
    };
  }
  constructor(db, pgp, logger) {
    super(db, pgp, portalUserTenantsSchema, logger);
  }

  /**
   * Lock and return the active membership linking a portal user and tenant, if any.
   * @param {string} portalUserId
   * @param {string} tenantId
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<object|null>}
   */
  async lockByUserAndTenant(portalUserId, tenantId, { tx }) {
    return tx.oneOrNone(
      `SELECT * FROM ${table(this)}
        WHERE portal_user_id=$1 AND tenant_id=$2 AND deactivated_at IS NULL FOR UPDATE`,
      [portalUserId, tenantId]
    );
  }

  /**
   * Lock and return a membership by identifier, archived or not.
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
