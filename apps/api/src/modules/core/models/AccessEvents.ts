/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { TableModel } from 'pg-schemata';
import type { DbConnection, Database, TableSchema } from 'pg-schemata';
/** Does: Describes stored access_events records. Used by: transaction services. */
export type AccessEventsRow = {
  id: string;
  tenant_id: string;
  operator_id: string;
  event: string;
  detail: unknown;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
};
/** Does: Defines the app.access_events schema. Used by: AccessEvents. */
export const schema: TableSchema = {
  dbSchema: 'app',
  table: 'access_events',
  hasAuditFields: {
    enabled: true,
    userFields: {
      type: 'uuid',
    },
  },
  softDelete: false,
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
      name: 'operator_id',
      type: 'uuid',
      notNull: true,
    },
    {
      name: 'event',
      type: 'text',
      notNull: true,
    },
    {
      name: 'detail',
      type: 'jsonb',
      notNull: true,
    },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['tenant_id', 'id']],
    foreignKeys: [],
    checks: [],
    indexes: [],
  },
};
/** Does: Reads and writes access_events. Called by: transaction-bound services. */
export class AccessEvents extends TableModel<AccessEventsRow> {
  /** Does: Binds the table to a connection. Called by: repository composition. */
  constructor(db: DbConnection, pgp: Database['pgp']) {
    super(db, pgp, schema);
  }
}
