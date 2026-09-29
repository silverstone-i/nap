/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

/**
 * Schema object for `reference.countries`: one ISO 3166-1 country
 * (M0004-R001). Kept identical to the copy frozen in migration
 * `001-reference-data`.
 */
export const countriesSchema = {
  dbSchema: 'reference',
  table: 'countries',
  columns: [
    { name: 'code', type: 'char(2)', notNull: true, immutable: true },
    { name: 'alpha3', type: 'char(3)', notNull: true },
    { name: 'numeric_code', type: 'char(3)', notNull: true },
    { name: 'name', type: 'text', notNull: true },
  ],
  constraints: {
    primaryKey: ['code'],
    unique: [['alpha3'], ['numeric_code']],
    checks: [
      "code ~ '^[A-Z]{2}$'",
      "alpha3 ~ '^[A-Z]{3}$'",
      "numeric_code ~ '^[0-9]{3}$'",
    ],
  },
};

/** Model for `reference.countries`. `nap-app` may only read it. */
export class Countries extends TableModel {
  static schema = countriesSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, countriesSchema, logger);
  }

  /**
   * Every country, sorted by name (M0004-R008).
   * @returns {Promise<{code: string, alpha3: string, numericCode: string, name: string}[]>}
   */
  async listByName() {
    return this.db.any(
      `SELECT code, alpha3, numeric_code AS "numericCode", name
         FROM ${this.schemaName}.${this.tableName} ORDER BY name, code`
    );
  }
}
