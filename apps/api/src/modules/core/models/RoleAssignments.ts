/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { AuditFields, SoftDelete } from '../../../db/rowFields.js';
import { TableModel } from 'pg-schemata';
import type { DbConnection, Database, TableSchema } from 'pg-schemata';
/** Does: Describes stored role_assignments records. Used by: transaction services. */
export type RoleAssignmentsRow = {
  id: string;
  tenant_id: string;
  role_id: string;
  binding_id: string;
  scope: string;
} & AuditFields &
  SoftDelete;
/** Does: Defines the app.role_assignments schema. Used by: RoleAssignments. */
export const schema: TableSchema = {
  dbSchema: 'app',
  table: 'role_assignments',
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
      name: 'role_id',
      type: 'uuid',
      notNull: true,
    },
    {
      name: 'binding_id',
      type: 'uuid',
      notNull: true,
    },
    {
      name: 'scope',
      type: 'text',
      notNull: true,
    },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['tenant_id', 'id']],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['tenant_id', 'role_id'],
        references: {
          schema: 'app',
          table: 'roles',
          columns: ['tenant_id', 'id'],
        },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['tenant_id', 'binding_id'],
        references: {
          schema: 'cell',
          table: 'tenant_user_bindings',
          columns: ['tenant_id', 'id'],
        },
        onDelete: 'RESTRICT',
      },
    ],
    checks: [
      "scope IN ('self','companies','projects','all_companies','all_projects','company_projects','tenant')",
    ],
    indexes: [],
  },
};
/** Does: Reads and writes role_assignments. Called by: transaction-bound services. */
export class RoleAssignments extends TableModel<RoleAssignmentsRow> {
  /** Does: Binds the table to a connection. Called by: repository composition. */
  constructor(db: DbConnection, pgp: Database['pgp']) {
    super(db, pgp, schema);
  }
}
