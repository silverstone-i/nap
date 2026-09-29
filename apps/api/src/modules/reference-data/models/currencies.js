/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

/**
 * Schema object for `reference.currencies`: one ISO 4217 currency
 * (M0004-R002). Kept identical to the copy frozen in migration
 * `001-reference-data`.
 */
export const currenciesSchema = {
  dbSchema: 'reference',
  table: 'currencies',
  columns: [
    { name: 'code', type: 'char(3)', notNull: true, immutable: true },
    { name: 'numeric_code', type: 'char(3)', notNull: true },
    { name: 'name', type: 'text', notNull: true },
    { name: 'minor_unit', type: 'smallint', notNull: true },
  ],
  constraints: {
    primaryKey: ['code'],
    unique: [['numeric_code']],
    checks: [
      "code ~ '^[A-Z]{3}$'",
      "numeric_code ~ '^[0-9]{3}$'",
      'minor_unit BETWEEN 0 AND 4',
    ],
  },
};

/** Model for `reference.currencies`. `nap-app` may only read it. */
export class Currencies extends TableModel {
  static schema = currenciesSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, currenciesSchema, logger);
  }

  /**
   * Every currency, sorted by name (M0004-R008).
   * @returns {Promise<{code: string, numericCode: string, name: string, minorUnit: number}[]>}
   */
  async listByName() {
    return this.db.any(
      `SELECT code, numeric_code AS "numericCode", name, minor_unit AS "minorUnit"
         FROM ${this.schemaName}.${this.tableName} ORDER BY name, code`
    );
  }
}
