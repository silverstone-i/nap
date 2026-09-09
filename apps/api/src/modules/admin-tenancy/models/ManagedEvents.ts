/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { AuditFields } from '../../../db/rowFields.js';
import { TableModel } from 'pg-schemata';
import type { DbConnection, Database, TableSchema } from 'pg-schemata';

/** Does: Describes stored managed_events values. Used by: its repository and services. */
export type ManagedEventsRow = {
  id: string;
  operator_id: string;
  effective_user_id: string | null;
  target_id: string | null;
  event: string;
  reason: string;
  session_id: string | null;
} & AuditFields;
/** Does: Defines admin.managed_events. Used by: the ManagedEvents repository. */
export const schema: TableSchema = {
  dbSchema: 'admin',
  table: 'managed_events',
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
      name: 'operator_id',
      type: 'uuid',
      notNull: true,
    },
    {
      name: 'effective_user_id',
      type: 'uuid',
    },
    {
      name: 'target_id',
      type: 'uuid',
    },
    {
      name: 'event',
      type: 'text',
      notNull: true,
    },
    {
      name: 'reason',
      type: 'text',
      notNull: true,
    },
    {
      name: 'session_id',
      type: 'uuid',
    },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: [],
    indexes: [],
    foreignKeys: [],
    unique: [],
  },
};
/** Does: Persists managed_events records. Called by: transaction-bound services. */
export class ManagedEvents extends TableModel<ManagedEventsRow> {
  /** Does: Binds the model to a connection. Called by: repository composition. */
  constructor(db: DbConnection, pgp: Database['pgp']) {
    super(db, pgp, schema);
  }
}
