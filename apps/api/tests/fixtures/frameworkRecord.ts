/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';
import type { DbConnection, Database, TableSchema } from 'pg-schemata';

/**
 * Does: Represents one row of the framework test table.
 * Used by: FrameworkRecords and the framework tests.
 */
export type FrameworkRecordRow = {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  quantity: number | null;
  parent_id: string | null;
  created_at: Date;
  created_by: string | null;
  updated_at: Date;
  updated_by: string | null;
  deactivated_at: Date | null;
};

/**
 * Does: Declares the framework test table: a tenant-owned, audited,
 * soft-deleting table with a tenant-inclusive self reference.
 * Used by: FrameworkRecords, and the frozen test migration mirrors it.
 * Why: it exercises every column kind the framework treats specially:
 * managed audit columns, the deactivation column, an immutable key, and a
 * tenant-inclusive foreign key. Tests only; never a production registry.
 */
export const frameworkRecordSchema: TableSchema = {
  dbSchema: 'app',
  table: 'framework_record',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', immutable: true },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'code', type: 'varchar(16)', notNull: true },
    { name: 'name', type: 'varchar(128)', notNull: true },
    { name: 'quantity', type: 'integer' },
    { name: 'parent_id', type: 'uuid' },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [
      ['tenant_id', 'id'],
      ['tenant_id', 'code'],
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['tenant_id', 'parent_id'],
        references: {
          schema: 'app',
          table: 'framework_record',
          columns: ['tenant_id', 'id'],
        },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [{ columns: ['tenant_id', 'parent_id'] }],
  },
};

/**
 * Does: Binds the framework test table as a writable model, the shape a
 * module's repository takes.
 * Used by: the framework fixtures and tests.
 */
export class FrameworkRecords extends TableModel<FrameworkRecordRow> {
  constructor(db: DbConnection, pgp: Database['pgp']) {
    super(db, pgp, frameworkRecordSchema);
  }
}
