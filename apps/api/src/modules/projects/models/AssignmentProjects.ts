/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { AuditFields, SoftDelete } from '../../../db/rowFields.js';
import { TableModel } from 'pg-schemata';
import type { DbConnection, Database, TableSchema } from 'pg-schemata';
/** Does: Describes stored assignment_projects records. Used by: transaction services. */
export type AssignmentProjectsRow = {
  id: string;
  tenant_id: string;
  assignment_id: string;
  project_id: string;
} & AuditFields &
  SoftDelete;
/** Does: Defines the app.assignment_projects schema. Used by: AssignmentProjects. */
export const schema: TableSchema = {
  dbSchema: 'app',
  table: 'assignment_projects',
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
      name: 'project_id',
      type: 'uuid',
      notNull: true,
    },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [
      ['tenant_id', 'id'],
      ['tenant_id', 'assignment_id', 'project_id'],
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
        columns: ['tenant_id', 'project_id'],
        references: {
          schema: 'app',
          table: 'projects',
          columns: ['tenant_id', 'id'],
        },
        onDelete: 'RESTRICT',
      },
    ],
    checks: [],
    indexes: [],
  },
};
/** Does: Reads and writes assignment_projects. Called by: transaction-bound services. */
export class AssignmentProjects extends TableModel<AssignmentProjectsRow> {
  /** Does: Binds the table to a connection. Called by: repository composition. */
  constructor(db: DbConnection, pgp: Database['pgp']) {
    super(db, pgp, schema);
  }
}
