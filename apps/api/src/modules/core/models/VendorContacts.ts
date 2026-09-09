/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { AuditFields, SoftDelete } from '../../../db/rowFields.js';
import { TableModel } from 'pg-schemata';
import type { DbConnection, Database, TableSchema } from 'pg-schemata';

/** Does: Describes stored vendor_contacts values. Used by: its repository and services. */
export type VendorContactsRow = {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  email: string;
  is_app_user: boolean;
  vendor_id: string;
} & AuditFields &
  SoftDelete;
/** Does: Defines app.vendor_contacts. Used by: the VendorContacts repository. */
export const schema: TableSchema = {
  dbSchema: 'app',
  table: 'vendor_contacts',
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
    {
      name: 'vendor_id',
      type: 'uuid',
      notNull: true,
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
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['tenant_id', 'vendor_id'],
        references: {
          schema: 'app',
          table: 'vendors',
          columns: ['tenant_id', 'id'],
        },
        onDelete: 'RESTRICT',
      },
    ],
    unique: [['tenant_id', 'id']],
  },
};
/** Does: Persists vendor_contacts records. Called by: transaction-bound services. */
export class VendorContacts extends TableModel<VendorContactsRow> {
  /** Does: Binds the model to a connection. Called by: repository composition. */
  constructor(db: DbConnection, pgp: Database['pgp']) {
    super(db, pgp, schema);
  }
}
