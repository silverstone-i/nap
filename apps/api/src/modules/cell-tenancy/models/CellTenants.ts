/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';
import type { DbConnection, Database, TableSchema } from 'pg-schemata';

/** Does: Describes stored tenants values. Used by: its repository and services. */
export type CellTenantsRow = {
  revision: number;
  id: string;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
  deactivated_at: Date | null;
  tenant_id: string;
  code: string;
  status: string;
};
/** Does: Defines cell.tenants. Used by: the CellTenants repository. */
export const schema: TableSchema = {
  dbSchema: 'cell',
  table: 'tenants',
  hasAuditFields: {
    enabled: true,
    userFields: {
      type: 'uuid',
    },
  },
  softDelete: true,
  columns: [
    { name: 'revision', type: 'integer', notNull: true, default: 1 },
    {
      name: 'id',
      type: 'uuid',
      notNull: true,

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
      name: 'status',
      type: 'text',
      notNull: true,
    },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: [],
    indexes: [],
    foreignKeys: [],
    unique: [['tenant_id', 'id']],
  },
};
/** Does: Persists tenants records. Called by: transaction-bound services. */
export class CellTenants extends TableModel<CellTenantsRow> {
  /** Does: Binds the model to a connection. Called by: repository composition. */
  constructor(db: DbConnection, pgp: Database['pgp']) {
    super(db, pgp, schema);
  }
}
