/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { AuditFields, SoftDelete } from '../../../db/rowFields.js';
import { TableModel } from 'pg-schemata';
import type { DbConnection, Database, TableSchema } from 'pg-schemata';

/**
 * Does: Represents a stored portal_user_tenants record.
 * Used by: the PortalUserTenants repository.
 */
export type PortalUserTenantsRow = {
  id: string;
  user_type: string | null;
  entity_id: string | null;
  ready: boolean;
  revision: number;
  portal_user_id: string;
  tenant_id: string;
  status: string;
} & AuditFields &
  SoftDelete;

/**
 * Does: Declares the columns and constraints of admin.portal_user_tenants.
 * Used by: the PortalUserTenants model.
 */
export const portal_user_tenantsSchema: TableSchema = {
  dbSchema: 'admin',
  table: 'portal_user_tenants',
  hasAuditFields: {
    enabled: true,
    userFields: {
      type: 'uuid',
    },
  },
  softDelete: true,
  columns: [
    { name: 'revision', type: 'integer', notNull: true, default: 1 },
    { name: 'user_type', type: 'text' },
    { name: 'entity_id', type: 'uuid' },
    { name: 'ready', type: 'boolean', notNull: true, default: false },
    {
      name: 'id',
      type: 'uuid',
      default: 'gen_random_uuid()',
      immutable: true,
    },
    {
      name: 'portal_user_id',
      type: 'uuid',
      notNull: true,
    },
    {
      name: 'tenant_id',
      type: 'uuid',
      notNull: true,
    },
    {
      name: 'status',
      type: 'text',
      notNull: true,
    },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: ["status IN ('active', 'locked')"],
    indexes: [
      {
        columns: ['portal_user_id', 'tenant_id'],
        unique: true,
        where: 'deactivated_at IS NULL',
      },
      {
        columns: ['portal_user_id'],
      },
      {
        columns: ['tenant_id'],
      },
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['portal_user_id'],
        references: {
          schema: 'admin',
          table: 'portal_users',
          columns: ['id'],
        },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['tenant_id'],
        references: {
          schema: 'admin',
          table: 'tenants',
          columns: ['id'],
        },
        onDelete: 'RESTRICT',
      },
    ],
  },
};

/**
 * Does: Reads and writes admin.portal_user_tenants through the database library.
 * Called by: the admin repository registry.
 */
export class PortalUserTenants extends TableModel<PortalUserTenantsRow> {
  /**
   * Does: Binds this model to its transaction or database connection.
   * Called by: the database library when constructing repositories.
   */
  constructor(db: DbConnection, pgp: Database['pgp']) {
    super(db, pgp, portal_user_tenantsSchema);
  }
  /**
   * Does: Loads active tenant memberships and tenant names for an identity.
   * Called by: authentication services during a request.
   */
  async activeFor(actorId: string) {
    return this.db.any<{
      id: string;
      tenant_id: string;
      tenant_code: string;
      company: string;
      user_type: string | null;
      entity_id: string | null;
    }>(
      `
      SELECT m.id, m.tenant_id, t.tenant_code,t.company,m.user_type,m.entity_id FROM admin.portal_user_tenants m
      JOIN admin.tenants t ON t.id = m.tenant_id
      WHERE m.portal_user_id = $1 AND m.ready AND m.status = 'active' AND m.deactivated_at IS NULL
        AND t.status = 'active' AND t.deactivated_at IS NULL
      ORDER BY m.tenant_id FOR SHARE OF m, t`,
      [actorId]
    );
  }
}
