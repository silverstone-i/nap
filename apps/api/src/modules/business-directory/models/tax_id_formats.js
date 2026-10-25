/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { DirectoryModel } from './directoryModel.js';

/**
 * Schema object for `app.tax_id_formats`: tenant-defined tax ID formats for each country (M0005-R036). Names are unique per country, archived formats included.
 * Kept identical to the copy frozen in migration `001-business-directory`.
 */
export const taxIdFormatsSchema = {
  dbSchema: 'app',
  table: 'tax_id_formats',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  softDelete: true,
  columns: [
    {
      name: 'id',
      type: 'uuid',
      notNull: true,
      default: 'gen_random_uuid()',
      immutable: true,
    },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'country', type: 'char(2)', notNull: true, immutable: true },
    { name: 'name', type: 'varchar(64)', notNull: true },
    { name: 'mask', type: 'varchar(64)', notNull: true },
    { name: 'revision', type: 'integer', notNull: true, default: 1 },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [
      ['tenant_id', 'id'],
      ['tenant_id', 'country', 'name'],
    ],
    checks: ['revision > 0'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['country'],
        references: {
          schema: 'reference',
          table: 'countries',
          columns: ['code'],
        },
        onDelete: 'RESTRICT',
      },
    ],
  },
};

/** Model for `app.tax_id_formats`. Subject to the tenant row-level security rule. */
export class TaxIdFormats extends DirectoryModel {
  static schema = taxIdFormatsSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, taxIdFormatsSchema, logger);
  }

  /**
   * Whether any record, active or archived, holds a tax ID in this format
   * (M0005-R041).
   * @param {string} id
   * @param {{tx: object}} options
   * @returns {Promise<boolean>}
   */
  async inUse(id, { tx }) {
    const row = await tx.one(
      'SELECT EXISTS (SELECT 1 FROM app.parties WHERE tax_id_format_id = $1) AS used',
      [id]
    );
    return row.used;
  }
}
