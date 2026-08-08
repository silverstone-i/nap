/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IMain } from 'pg-promise';
import { TableModel } from 'pg-schemata';
import type { DbConnection, Logger, TableSchema } from 'pg-schemata';

export interface CountryRow {
  code: string;
  name: string;
  dial_code: string | null;
  placeholder: string | null;
}

/**
 * ISO 3166-1 reference data (`admin.countries`), the FK target for every
 * `country_code`. Natural `char(2)` primary key — the documented ADR-0005
 * exception to the universal uuid `id` — with no audit columns and no soft
 * delete.
 */
export const countriesSchema: TableSchema = {
  dbSchema: 'admin',
  table: 'countries',
  hasAuditFields: false,
  softDelete: false,
  columns: [
    { name: 'code', type: 'char(2)', notNull: true, immutable: true },
    { name: 'name', type: 'varchar(128)', notNull: true },
    { name: 'dial_code', type: 'varchar(8)' },
    { name: 'placeholder', type: 'varchar(64)' },
  ],
  constraints: {
    primaryKey: ['code'],
  },
};

export class Countries extends TableModel<CountryRow> {
  constructor(db: DbConnection, pgp: IMain, logger: Logger | null = null) {
    super(db, pgp, countriesSchema, logger);
  }
}
