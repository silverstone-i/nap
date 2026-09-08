/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';
import type { DbConnection, Database, TableSchema } from 'pg-schemata';

/**
 * Does: Represents a stored tenants record.
 * Used by: the Tenants repository.
 */
export type TenantsRow = {
  id: string;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
  deactivated_at: Date | null;
  tenant_code: string;
  company: string;
  status: string;
};

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
    checks: ["status IN ('pending', 'active', 'suspended')"],
    indexes: [
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
      GRANT DELETE ON admin.login_throttles TO $1:name`,
      [role]
    );
  }
}
