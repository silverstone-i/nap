/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { AuditFields, SoftDelete } from '../../../db/rowFields.js';
import { TableModel } from 'pg-schemata';
import type { DbConnection, Database, TableSchema } from 'pg-schemata';
/** Does: Describes stored projects records. Used by: transaction services. */
export type ProjectsRow = {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  company_id: string;
} & AuditFields &
  SoftDelete;
/** Does: Defines the app.projects schema. Used by: Projects. */
export const schema: TableSchema = {
  dbSchema: 'app',
  table: 'projects',
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
    },
    {
      name: 'name',
      type: 'text',
      notNull: true,
    },
    {
      name: 'company_id',
      type: 'uuid',
      notNull: true,
      immutable: true,
    },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['tenant_id', 'id']],
    foreignKeys: [
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
    indexes: [
      {
        columns: ['tenant_id', 'code'],
        unique: true,
        where: 'deactivated_at IS NULL',
      },
    ],
  },
};
/** Does: Reads and writes projects. Called by: transaction-bound services. */
export class Projects extends TableModel<ProjectsRow> {
  /** Does: Binds the table to a connection. Called by: repository composition. */
  constructor(db: DbConnection, pgp: Database['pgp']) {
    super(db, pgp, schema);
  }
}
