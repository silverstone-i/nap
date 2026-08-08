/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IMain } from 'pg-promise';
import { TableModel } from 'pg-schemata';
import { z } from 'zod';
import type { DbConnection, Logger, TableSchema } from 'pg-schemata';
import type { EntityRow } from '../../../db/index.js';

export interface VendorContactRow extends EntityRow {
  vendor_id: string;
  source_id: string;
  first_name: string;
  last_name: string;
  position: string | null;
  department: string | null;
  is_app_user: boolean;
  roles: string[];
  is_primary: boolean;
}

/** People at a vendor; may hold roles and log in. */
export const vendorContactsSchema: TableSchema = {
  dbSchema: 'tenant',
  table: 'vendor_contacts',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  softDelete: true,
  columns: [
    {
      name: 'id',
      type: 'uuid',
      default: 'gen_random_uuid()',
      immutable: true,
      colProps: { cnd: true },
    },
    { name: 'vendor_id', type: 'uuid', notNull: true },
    { name: 'source_id', type: 'uuid', notNull: true },
    { name: 'first_name', type: 'varchar(64)', notNull: true },
    { name: 'last_name', type: 'varchar(64)', notNull: true },
    { name: 'position', type: 'varchar(64)' },
    { name: 'department', type: 'varchar(64)' },
    { name: 'is_app_user', type: 'boolean', notNull: true, default: false },
    {
      name: 'roles',
      type: 'text[]',
      notNull: true,
      default: "'{}'::text[]",
      colProps: { validator: z.array(z.string()) },
    },
    { name: 'is_primary', type: 'boolean', notNull: true, default: false },
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['vendor_id'],
        references: { table: 'vendors', columns: ['id'] },
        onDelete: 'CASCADE',
      },
      {
        type: 'ForeignKey',
        columns: ['source_id'],
        references: { table: 'sources', columns: ['id'] },
        onDelete: 'CASCADE',
      },
    ],
    indexes: [{ columns: ['vendor_id'] }, { columns: ['source_id'] }],
  },
};

export class VendorContacts extends TableModel<VendorContactRow> {
  constructor(db: DbConnection, pgp: IMain, logger: Logger | null = null) {
    super(db, pgp, vendorContactsSchema, logger);
  }
}
