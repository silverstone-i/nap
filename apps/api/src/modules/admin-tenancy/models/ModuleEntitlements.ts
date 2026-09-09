/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { AuditFields, SoftDelete } from '../../../db/rowFields.js';
import { TableModel } from 'pg-schemata';
import type { DbConnection, Database, TableSchema } from 'pg-schemata';
/** Does: Describes stored module_entitlements records. Used by: transaction services. */
export type ModuleEntitlementsRow = {
  id: string;
  tenant_id: string;
  module: string;
  enabled: boolean;
  revision: number;
} & AuditFields &
  SoftDelete;
/** Does: Defines the admin.module_entitlements schema. Used by: ModuleEntitlements. */
export const schema: TableSchema = {
  dbSchema: 'admin',
  table: 'module_entitlements',
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
      name: 'module',
      type: 'text',
      notNull: true,
    },
    {
      name: 'enabled',
      type: 'boolean',
      notNull: true,
      default: false,
    },
    {
      name: 'revision',
      type: 'integer',
      notNull: true,
      default: 1,
    },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['tenant_id', 'module']],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['tenant_id'],
        references: {
          schema: 'admin',
          table: 'tenants',
          columns: ['id'],
        },
        onDelete: 'RESTRICT',
      },
    ],
    checks: ["module = 'projects'", 'revision > 0'],
    indexes: [],
  },
};
/** Does: Reads and writes module_entitlements. Called by: transaction-bound services. */
export class ModuleEntitlements extends TableModel<ModuleEntitlementsRow> {
  /** Does: Binds the table to a connection. Called by: repository composition. */
  constructor(db: DbConnection, pgp: Database['pgp']) {
    super(db, pgp, schema);
  }
}
