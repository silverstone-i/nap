/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IMain } from 'pg-promise';
import { TableModel } from 'pg-schemata';
import type { DbConnection, Logger, TableSchema } from 'pg-schemata';
import type { EntityRow } from '../../../db/index.js';

export interface ContactRow extends EntityRow {
  source_id: string;
  name: string;
  code: string;
  is_active: boolean;
}

/**
 * Standalone payees and receivable counterparties (one-off commissions,
 * donations); cannot log in.
 */
export const contactsSchema: TableSchema = {
  dbSchema: 'tenant',
  table: 'contacts',
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
    { name: 'is_active', type: 'boolean', notNull: true, default: true },
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
    ],
    indexes: [
      { columns: ['code'], unique: true, where: 'deactivated_at IS NULL' },
      { columns: ['source_id'] },
    ],
  },
};

export class Contacts extends TableModel<ContactRow> {
  constructor(db: DbConnection, pgp: IMain, logger: Logger | null = null) {
    super(db, pgp, contactsSchema, logger);
  }
}
