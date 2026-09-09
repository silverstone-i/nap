/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { TableModel } from 'pg-schemata';
import type { DbConnection, Database, TableSchema } from 'pg-schemata';
/** Does: Describes stored roles records. Used by: transaction services. */
export type RolesRow = {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  permanent: boolean;
  capabilities: unknown;
  fields: unknown;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
  deactivated_at: Date | null;
};
/** Does: Defines the app.roles schema. Used by: Roles. */
export const schema: TableSchema = {
  dbSchema: 'app',
  table: 'roles',
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
      notNull: true,
      default: 'gen_random_uuid()',
      immutable: true,
    },
    {
      name: 'tenant_id',
      type: 'uuid',
      notNull: true,
      immutable: true,
    },
    {
      name: 'code',
      type: 'text',
      notNull: true,
      immutable: true,
    },
    {
      name: 'name',
      type: 'text',
      notNull: true,
    },
    {
      name: 'permanent',
      type: 'boolean',
      notNull: true,
      default: false,
    },
    {
      name: 'capabilities',
      type: 'jsonb',
      notNull: true,
      default: "'[]'::jsonb",
    },
    {
      name: 'fields',
      type: 'jsonb',
      notNull: true,
      default: "'[]'::jsonb",
    },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [
      ['tenant_id', 'id'],
      ['tenant_id', 'code'],
    ],
    foreignKeys: [],
    checks: [],
    indexes: [],
  },
};
/** Does: Reads and writes roles. Called by: transaction-bound services. */
export class Roles extends TableModel<RolesRow> {
  /** Does: Binds the table to a connection. Called by: repository composition. */
  constructor(db: DbConnection, pgp: Database['pgp']) {
    super(db, pgp, schema);
  }
  /** Does: Serializes tenant access changes and reads. Called by: authorization and administration. */
  async lockTenant(tenantId: string, shared = false) {
    await this.db.any(
      shared
        ? 'SELECT id FROM cell.tenants WHERE tenant_id=$1 FOR SHARE'
        : 'SELECT id FROM cell.tenants WHERE tenant_id=$1 FOR UPDATE',
      [tenantId]
    );
  }
}
