/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { AuditFields, SoftDelete } from '../../../db/rowFields.js';
import { TableModel } from 'pg-schemata';
import type { DbConnection, Database, TableSchema } from 'pg-schemata';

/** Does: Describes stored clients values. Used by: its repository and services. */
export type ClientsRow = {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  email: string;
  is_app_user: boolean;
} & AuditFields &
  SoftDelete;
/** Does: Defines app.clients. Used by: the Clients repository. */
export const schema: TableSchema = {
  dbSchema: 'app',
  table: 'clients',
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
      name: 'email',
      type: 'text',
      notNull: true,
    },
    {
      name: 'is_app_user',
      type: 'boolean',
      notNull: true,
      default: true,
    },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: [],
    indexes: [
      {
        columns: ['tenant_id', 'code'],
        unique: true,
        where: 'deactivated_at IS NULL',
      },
    ],
    foreignKeys: [],
    unique: [['tenant_id', 'id']],
  },
};
/** Does: Persists clients records. Called by: transaction-bound services. */
export class Clients extends TableModel<ClientsRow> {
  /** Does: Binds the model to a connection. Called by: repository composition. */
  constructor(db: DbConnection, pgp: Database['pgp']) {
    super(db, pgp, schema);
  }
}
