/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';
import type { DbConnection, Database, TableSchema } from 'pg-schemata';

/** Does: Describes stored platform_grants values. Used by: its repository and services. */
export type PlatformGrantsRow = {
  id: string;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
  deactivated_at: Date | null;
  portal_user_id: string;
  role: string;
  permission: string;
};
/** Does: Defines admin.platform_grants. Used by: the PlatformGrants repository. */
export const schema: TableSchema = {
  dbSchema: 'admin',
  table: 'platform_grants',
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
    {
      name: 'permission',
      type: 'text',
      notNull: true,
    },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: ["role IN ('package_admin','support')"],
    indexes: [
      {
        columns: ['portal_user_id', 'permission'],
        unique: true,
        where: 'deactivated_at IS NULL',
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
    ],
    unique: [],
  },
};
/** Does: Persists platform_grants records. Called by: transaction-bound services. */
export class PlatformGrants extends TableModel<PlatformGrantsRow> {
  /** Does: Binds the model to a connection. Called by: repository composition. */
  constructor(db: DbConnection, pgp: Database['pgp']) {
    super(db, pgp, schema);
  }
}
