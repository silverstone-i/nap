/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IMain } from 'pg-promise';
import { TableModel } from 'pg-schemata';
import type { DbConnection, Logger, TableSchema } from 'pg-schemata';
import type { EntityRow } from '../../../db/index.js';

export interface VendorRow extends EntityRow {
  source_id: string;
  name: string;
  code: string;
  payment_term_id: string | null;
  is_active: boolean;
  notes: string | null;
}

/** Vendor master. `code` is unique per tenant while active, auto-numbered. */
export const vendorsSchema: TableSchema = {
  dbSchema: 'tenant',
  table: 'vendors',
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
    { name: 'source_id', type: 'uuid', notNull: true },
    { name: 'name', type: 'varchar(128)', notNull: true },
    { name: 'code', type: 'varchar(16)', notNull: true },
    { name: 'payment_term_id', type: 'uuid' },
    { name: 'is_active', type: 'boolean', notNull: true, default: true },
    { name: 'notes', type: 'text' },
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['source_id'],
        references: { table: 'sources', columns: ['id'] },
        onDelete: 'CASCADE',
      },
      {
        type: 'ForeignKey',
        columns: ['payment_term_id'],
        references: { table: 'payment_terms', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [
      { columns: ['code'], unique: true, where: 'deactivated_at IS NULL' },
      { columns: ['source_id'] },
      { columns: ['payment_term_id'] },
    ],
  },
};

export class Vendors extends TableModel<VendorRow> {
  constructor(db: DbConnection, pgp: IMain, logger: Logger | null = null) {
    super(db, pgp, vendorsSchema, logger);
  }
}
