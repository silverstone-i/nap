/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { TableModel } from 'pg-schemata';
import type { DbConnection, Database, TableSchema } from 'pg-schemata';
/** Does: Describes stored platform_roles records. Used by: transaction services. */
export type PlatformRolesRow = {
  id: string;
  portal_user_id: string;
  role: string;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
  deactivated_at: Date | null;
};
/** Does: Defines the admin.platform_roles schema. Used by: PlatformRoles. */
export const schema: TableSchema = {
  dbSchema: 'admin',
  table: 'platform_roles',
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
      name: 'portal_user_id',
      type: 'uuid',
      notNull: true,
    },
    {
      name: 'role',
      type: 'text',
      notNull: true,
    },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['portal_user_id', 'role']],
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
    ],
    checks: ["role IN ('platform_admin','support')"],
    indexes: [],
  },
};
/** Does: Reads and writes platform_roles. Called by: transaction-bound services. */
export class PlatformRoles extends TableModel<PlatformRolesRow> {
  /** Does: Binds the table to a connection. Called by: repository composition. */
  constructor(db: DbConnection, pgp: Database['pgp']) {
    super(db, pgp, schema);
  }
}
