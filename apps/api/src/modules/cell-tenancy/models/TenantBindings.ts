/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';
import type { DbConnection, Database, TableSchema } from 'pg-schemata';

/** Does: Describes stored tenant_user_bindings values. Used by: its repository and services. */
export type TenantBindingsRow = {
  revision: number;
  id: string;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
  deactivated_at: Date | null;
  tenant_id: string;
  portal_user_id: string;
  entity_id: string | null;
  user_type: string | null;
  status: string;
};
/** Does: Defines cell.tenant_user_bindings. Used by: the TenantBindings repository. */
export const schema: TableSchema = {
  dbSchema: 'cell',
  table: 'tenant_user_bindings',
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
      name: 'portal_user_id',
      type: 'uuid',
      notNull: true,
    },
    {
      name: 'entity_id',
      type: 'uuid',
    },
    {
      name: 'user_type',
      type: 'text',
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
/** Does: Persists tenant_user_bindings records. Called by: transaction-bound services. */
export class TenantBindings extends TableModel<TenantBindingsRow> {
  /** Does: Binds the model to a connection. Called by: repository composition. */
  constructor(db: DbConnection, pgp: Database['pgp']) {
    super(db, pgp, schema);
  }
}
