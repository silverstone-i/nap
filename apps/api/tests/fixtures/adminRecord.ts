/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel, defineMigration } from 'pg-schemata';
import type { DbConnection, Database, TableSchema } from 'pg-schemata';
import type { NapModuleDescriptor } from '../../src/db/modules.js';

/**
 * Does: Represents one row of the admin framework test table.
 * Used by: AdminRecords and the admin router tests.
 */
export type AdminRecordRow = {
  id: string;
  code: string;
  name: string;
  quantity: number | null;
  created_at: Date;
  created_by: string | null;
  updated_at: Date;
  updated_by: string | null;
  deactivated_at: Date | null;
};

/**
 * Does: Declares the admin framework test table: a central, audited,
 * soft-deleting table with no tenant column.
 * Used by: AdminRecords, and the frozen test migration below mirrors it.
 * Why: it is the shape of a Central mutable table (database record
 * conventions), so it proves an admin-bound router works with no tenant
 * context. Tests only; never a production registry.
 */
export const adminRecordSchema: TableSchema = {
  dbSchema: 'admin',
  table: 'framework_admin_record',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', immutable: true },
    { name: 'code', type: 'varchar(16)', notNull: true },
    { name: 'name', type: 'varchar(128)', notNull: true },
    { name: 'quantity', type: 'integer' },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['code']],
  },
};

/**
 * Does: Binds the admin framework test table as a writable model, the shape
 * an admin module's repository takes.
 * Used by: the admin router fixtures and tests.
 */
export class AdminRecords extends TableModel<AdminRecordRow> {
  constructor(db: DbConnection, pgp: Database['pgp']) {
    super(db, pgp, adminRecordSchema);
  }
}

/**
 * Does: Lists the frozen migration that creates the admin framework test
 * table.
 * Used by: adminDatabase, and never a production registry.
 */
export const adminRecordModules: readonly NapModuleDescriptor[] = [
  {
    name: 'framework_admin_record',
    databaseTarget: 'admin',
    schema: 'admin',
    migrations: [
      defineMigration({
        id: '001-framework-admin-record',
        up: async ({ db }) => {
          await db.none(`
        CREATE TABLE admin.framework_admin_record (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          code varchar(16) NOT NULL UNIQUE,
          name varchar(128) NOT NULL,
          quantity integer,
          created_at timestamptz NOT NULL DEFAULT now(),
          created_by uuid,
          updated_at timestamptz NOT NULL DEFAULT now(),
          updated_by uuid,
          deactivated_at timestamptz
        );
      `);
        },
      }),
    ],
  },
];
