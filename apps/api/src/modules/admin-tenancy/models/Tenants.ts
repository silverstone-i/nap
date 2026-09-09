/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { AuditFields, SoftDelete } from '../../../db/rowFields.js';
import { TableModel } from 'pg-schemata';
import type { DbConnection, Database, TableSchema } from 'pg-schemata';

/**
 * Does: Represents a stored tenants record.
 * Used by: the Tenants repository.
 */
export type TenantsRow = {
  id: string;
  tier: string;
  cell_id: string | null;
  provisioned: boolean;
  rbac_ready: boolean;
  revision: number;
  tenant_code: string;
  company: string;
  status: string;
} & AuditFields &
  SoftDelete;

/**
 * Does: Declares the columns and constraints of admin.tenants.
 * Used by: the Tenants model.
 */
export const tenantsSchema: TableSchema = {
  dbSchema: 'admin',
  table: 'tenants',
  hasAuditFields: {
    enabled: true,
    userFields: {
      type: 'uuid',
    },
  },
  softDelete: true,
  columns: [
    { name: 'revision', type: 'integer', notNull: true, default: 1 },
    { name: 'tier', type: 'text', notNull: true, default: 'starter' },
    { name: 'cell_id', type: 'uuid' },
    { name: 'rbac_ready', type: 'boolean', notNull: true, default: false },
    { name: 'provisioned', type: 'boolean', notNull: true, default: false },
    {
      name: 'id',
      type: 'uuid',
      default: 'gen_random_uuid()',
      immutable: true,
    },
    {
      name: 'tenant_code',
      type: 'varchar(16)',
      notNull: true,
    },
    {
      name: 'company',
      type: 'varchar(128)',
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
    checks: [
      "status IN ('pending', 'active', 'suspended')",
      "tier IN ('starter','growth','enterprise')",
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
      { columns: ['cell_id'] },
      {
        columns: ['tenant_code'],
        unique: true,
        where: 'deactivated_at IS NULL',
      },
    ],
  },
};

/**
 * Does: Reads and writes admin.tenants through the database library.
 * Called by: the admin repository registry.
 */
export class Tenants extends TableModel<TenantsRow> {
  /**
   * Does: Binds this model to its transaction or database connection.
   * Called by: the database library when constructing repositories.
   */
  constructor(db: DbConnection, pgp: Database['pgp']) {
    super(db, pgp, tenantsSchema);
  }
  /**
   * Does: Locks the bootstrap namespace while the seed creates its rows.
   * Called by: the bootstrap service inside its transaction.
   */
  async lockBootstrap() {
    await this.db.any('SELECT pg_advisory_xact_lock(731, 1)');
  }
  /**
   * Does: Grants the runtime role only the table operations used by authentication.
   * Called by: the admin migration script after applying the module migrations.
   * Why: sessions and identities have no hard-delete contract; AUTH-005 permits
   * deletion only of expired transient throttle records.
   */
  async grantRuntime(role: string) {
    await this.db.none(
      `GRANT USAGE ON SCHEMA admin TO $1:name;
      GRANT SELECT, INSERT, UPDATE ON admin.tenants, admin.portal_users,
        admin.portal_user_tenants, admin.sessions, admin.login_throttles TO $1:name;
      GRANT DELETE ON admin.login_throttles TO $1:name;
      GRANT SELECT, INSERT, UPDATE ON admin.cells, admin.platform_grants, admin.provisioning_jobs,admin.platform_roles,admin.support_policy,admin.module_entitlements TO $1:name;
      GRANT SELECT, INSERT ON admin.managed_events TO $1:name`,
      [role]
    );
  }
}
