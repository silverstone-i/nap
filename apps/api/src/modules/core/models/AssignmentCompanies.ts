/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { TableModel } from 'pg-schemata';
import type { DbConnection, Database, TableSchema } from 'pg-schemata';
/** Does: Describes stored assignment_companies records. Used by: transaction services. */
export type AssignmentCompaniesRow = {
  id: string;
  tenant_id: string;
  assignment_id: string;
  company_id: string;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
  deactivated_at: Date | null;
};
/** Does: Defines the app.assignment_companies schema. Used by: AssignmentCompanies. */
export const schema: TableSchema = {
  dbSchema: 'app',
  table: 'assignment_companies',
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
      name: 'assignment_id',
      type: 'uuid',
      notNull: true,
    },
    {
      name: 'company_id',
      type: 'uuid',
      notNull: true,
    },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [
      ['tenant_id', 'id'],
      ['tenant_id', 'assignment_id', 'company_id'],
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['tenant_id', 'assignment_id'],
        references: {
          schema: 'app',
          table: 'role_assignments',
          columns: ['tenant_id', 'id'],
        },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['tenant_id', 'company_id'],
        references: {
          schema: 'app',
          table: 'companies',
          columns: ['tenant_id', 'id'],
        },
        onDelete: 'RESTRICT',
      },
    ],
    checks: [],
    indexes: [],
  },
};
/** Does: Reads and writes assignment_companies. Called by: transaction-bound services. */
export class AssignmentCompanies extends TableModel<AssignmentCompaniesRow> {
  /** Does: Binds the table to a connection. Called by: repository composition. */
  constructor(db: DbConnection, pgp: Database['pgp']) {
    super(db, pgp, schema);
  }
}
