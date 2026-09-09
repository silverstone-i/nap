/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { TableModel } from 'pg-schemata';
import type { DbConnection, Database, TableSchema } from 'pg-schemata';
/** Does: Describes stored support_policy records. Used by: transaction services. */
export type SupportPolicyRow = {
  id: string;
  code: string;
  permissions: unknown;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
  deactivated_at: Date | null;
};
/** Does: Defines the admin.support_policy schema. Used by: SupportPolicy. */
export const schema: TableSchema = {
  dbSchema: 'admin',
  table: 'support_policy',
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
      name: 'code',
      type: 'text',
      notNull: true,
    },
    {
      name: 'permissions',
      type: 'jsonb',
      notNull: true,
    },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['code']],
    foreignKeys: [],
    checks: [],
    indexes: [],
  },
};
/** Does: Reads and writes support_policy. Called by: transaction-bound services. */
export class SupportPolicy extends TableModel<SupportPolicyRow> {
  /** Does: Binds the table to a connection. Called by: repository composition. */
  constructor(db: DbConnection, pgp: Database['pgp']) {
    super(db, pgp, schema);
  }
}
