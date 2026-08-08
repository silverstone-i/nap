/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IMain } from 'pg-promise';
import { TableModel } from 'pg-schemata';
import type { DbConnection, Logger, TableSchema } from 'pg-schemata';
import type { EntityRow } from '../../../db/index.js';

export interface TaxIdentifierRow extends EntityRow {
  source_id: string;
  country_code: string | null;
  tax_type: string;
  tax_value: string;
  is_primary: boolean;
}

/** Polymorphic tax ids, attached to any entity through `sources`. */
export const taxIdentifiersSchema: TableSchema = {
  dbSchema: 'tenant',
  table: 'tax_identifiers',
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
    { name: 'country_code', type: 'char(2)' },
    { name: 'tax_type', type: 'varchar(16)', notNull: true },
    { name: 'tax_value', type: 'varchar(64)', notNull: true },
    { name: 'is_primary', type: 'boolean', notNull: true, default: false },
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
        columns: ['country_code'],
        references: { schema: 'admin', table: 'countries', columns: ['code'] },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [{ columns: ['source_id'] }],
  },
};

export class TaxIdentifiers extends TableModel<TaxIdentifierRow> {
  constructor(db: DbConnection, pgp: IMain, logger: Logger | null = null) {
    super(db, pgp, taxIdentifiersSchema, logger);
  }
}
