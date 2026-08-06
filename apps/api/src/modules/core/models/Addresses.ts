/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IMain } from 'pg-promise';
import { TableModel } from 'pg-schemata';
import type { DbConnection, Logger, TableSchema } from 'pg-schemata';
import type { EntityRow } from '../../../db/index.js';

export interface AddressRow extends EntityRow {
  source_id: string;
  label: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  address_line_3: string | null;
  city: string | null;
  state_province: string | null;
  postal_code: string | null;
  country_code: string | null;
  is_primary: boolean;
}

/** Polymorphic addresses, attached to any entity through `sources`. */
export const addressesSchema: TableSchema = {
  dbSchema: 'tenant',
  table: 'addresses',
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
    { name: 'label', type: 'varchar(32)' },
    { name: 'address_line_1', type: 'varchar(255)' },
    { name: 'address_line_2', type: 'varchar(255)' },
    { name: 'address_line_3', type: 'varchar(255)' },
    { name: 'city', type: 'varchar(128)' },
    { name: 'state_province', type: 'varchar(128)' },
    { name: 'postal_code', type: 'varchar(20)' },
    { name: 'country_code', type: 'char(2)' },
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

export class Addresses extends TableModel<AddressRow> {
  constructor(db: DbConnection, pgp: IMain, logger: Logger | null = null) {
    super(db, pgp, addressesSchema, logger);
  }
}
