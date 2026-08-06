/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IMain } from 'pg-promise';
import { TableModel } from 'pg-schemata';
import type { DbConnection, Logger, TableSchema } from 'pg-schemata';
import type { EntityRow } from '../../../db/index.js';

export interface CompanyRow extends EntityRow {
  source_id: string;
  code: string;
  name: string;
  is_active: boolean;
}

/**
 * Legal entities under a tenant; sign contracts, hold bank accounts, scope
 * invoice numbering. `code` is required and unique per tenant while active,
 * not auto-numbered.
 */
export const companiesSchema: TableSchema = {
  dbSchema: 'tenant',
  table: 'companies',
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
    { name: 'code', type: 'varchar(16)', notNull: true },
    { name: 'name', type: 'varchar(128)', notNull: true },
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

export class Companies extends TableModel<CompanyRow> {
  constructor(db: DbConnection, pgp: IMain, logger: Logger | null = null) {
    super(db, pgp, companiesSchema, logger);
  }
}
