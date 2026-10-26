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
    { name: 'member_label', type: 'text' },
    { name: 'revision', type: 'integer', notNull: true, default: 1 },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: [
      "member_type IS NULL OR member_type IN ('employee', 'contact', 'vendor_contact', 'client_contact')",
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
        columns: ['portal_user_id', 'tenant_id', 'member_id'],
        unique: true,
        where: 'deactivated_at IS NULL',
      },
      {
        columns: ['portal_user_id', 'tenant_id'],
        unique: true,
        where: 'member_id IS NULL AND deactivated_at IS NULL',
      },
      {
        columns: ['tenant_id', 'member_id'],
        unique: true,
        where: "status IN ('pending', 'active') AND deactivated_at IS NULL",
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

/** Model for `admin.portal_user_tenants`, with the locked reads membership changes need. */
export class PortalUserTenants extends RevisionedTableModel {
  static schema = portalUserTenantsSchema;
  static revisionedColumns = [
    'portal_user_id',
    'tenant_id',
    'member_type',
    'member_id',
    'member_label',
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
      member_label: row.member_label ?? null,
      status: row.status,
      deactivated_at: row.deactivated_at ?? null,
    };
  }
  constructor(db, pgp, logger) {
    super(db, pgp, portalUserTenantsSchema, logger);
  }

  /**
   * The tenant codes of each user's unarchived memberships, for the Portal
   * Users list (I0002-R017).
   * @param {string[]} portalUserIds
   * @param {{tx?: import('pg-promise').IDatabase<unknown>}} [options]
   * @returns {Promise<Map<string, string[]>>} Codes in order, by user ID.
   */
  async tenantCodesByUser(portalUserIds, { tx } = {}) {
    if (!portalUserIds.length) return new Map();
    const rows = await (tx ?? this.db).manyOrNone(
      `SELECT m.portal_user_id,
              array_agg(DISTINCT t.tenant_code ORDER BY t.tenant_code) AS codes
         FROM ${table(this)} m
         JOIN admin.tenants t ON t.id = m.tenant_id
        WHERE m.portal_user_id = ANY($1::uuid[]) AND m.deactivated_at IS NULL
        GROUP BY m.portal_user_id`,
      [portalUserIds]
    );
    return new Map(rows.map(row => [row.portal_user_id, row.codes]));
  }

  /**
   * Lock and return a portal user's unarchived membership for one party in a
   * tenant (I0012-R003).
   * @param {string} portalUserId
   * @param {string} tenantId
   * @param {string} memberId The party ID.
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<object|null>}
   */
  async lockByParty(portalUserId, tenantId, memberId, { tx }) {
    return tx.oneOrNone(
      `SELECT * FROM ${table(this)}
        WHERE portal_user_id=$1 AND tenant_id=$2 AND member_id=$3
          AND deactivated_at IS NULL FOR UPDATE`,
      [portalUserId, tenantId, memberId]
    );
  }

  /**
   * Lock and return the pending or active membership holding a party, of any
   * login (I0012-R002).
   * @param {string} tenantId
   * @param {string} memberId The party ID.
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<object|null>}
   */
  async lockHolderOfParty(tenantId, memberId, { tx }) {
    return tx.oneOrNone(
      `SELECT * FROM ${table(this)}
        WHERE tenant_id=$1 AND member_id=$2 AND status IN ('pending', 'active')
          AND deactivated_at IS NULL FOR UPDATE`,
      [tenantId, memberId]
    );
  }

  /**
   * Lock and return a portal user's unarchived membership in a tenant that
   * has no party yet: the bootstrap login's, or an M0001-08 membership
   * before provisioning reports its member.
   * @param {string} portalUserId
   * @param {string} tenantId
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<object|null>}
   */
  async lockWithoutParty(portalUserId, tenantId, { tx }) {
    return tx.oneOrNone(
      `SELECT * FROM ${table(this)}
        WHERE portal_user_id=$1 AND tenant_id=$2 AND member_id IS NULL
          AND deactivated_at IS NULL FOR UPDATE`,
      [portalUserId, tenantId]
    );
  }

  /**
   * Lock and return every unarchived membership of a portal user in a tenant.
   * @param {string} portalUserId
   * @param {string} tenantId
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<object[]>}
   */
  async lockByUserAndTenant(portalUserId, tenantId, { tx }) {
    return tx.any(
      `SELECT * FROM ${table(this)}
        WHERE portal_user_id=$1 AND tenant_id=$2 AND deactivated_at IS NULL
        ORDER BY id FOR UPDATE`,
      [portalUserId, tenantId]
    );
  }

  /**
   * Lock and return a portal user's unarchived `pending` memberships.
   * @param {string} portalUserId
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<object[]>}
   */
  async lockPendingByUser(portalUserId, { tx }) {
    return tx.any(
      `SELECT * FROM ${table(this)}
        WHERE portal_user_id=$1 AND status='pending' AND deactivated_at IS NULL
        ORDER BY id FOR UPDATE`,
      [portalUserId]
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
