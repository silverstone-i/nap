/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IMain } from 'pg-promise';
import { TableModel } from 'pg-schemata';
import type { DbConnection, Logger, TableSchema } from 'pg-schemata';
import type { EntityRow } from '../../../db/index.js';

export interface PhoneNumberRow extends EntityRow {
  source_id: string;
  phone_type: string | null;
  country_code: string | null;
  phone_number: string;
  is_primary: boolean;
}

/** Polymorphic phones, attached to any entity through `sources`. */
export const phoneNumbersSchema: TableSchema = {
  dbSchema: 'tenant',
  table: 'phone_numbers',
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
    { name: 'phone_type', type: 'varchar(16)' },
    { name: 'country_code', type: 'char(2)' },
    { name: 'phone_number', type: 'varchar(32)', notNull: true },
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

export class PhoneNumbers extends TableModel<PhoneNumberRow> {
  constructor(db: DbConnection, pgp: IMain, logger: Logger | null = null) {
    super(db, pgp, phoneNumbersSchema, logger);
  }
}
