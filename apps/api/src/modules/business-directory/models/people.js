/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { DirectoryModel } from './directoryModel.js';

/**
 * Schema object for `app.people`: employees and contacts (M0005-R002). The tax ID is stored only in its protected form (R010).
 * Kept identical to the copy frozen in migration `001-business-directory`.
 */
export const peopleSchema = {
  dbSchema: 'app',
  table: 'people',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  softDelete: true,
  columns: [
    { name: 'party_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'first_name', type: 'varchar(160)', notNull: true },
    { name: 'last_name', type: 'varchar(160)', notNull: true },
    { name: 'tax_id_encrypted', type: 'text' },
    { name: 'tax_id_hash', type: 'char(64)' },
    { name: 'tax_id_last4', type: 'char(4)' },
    { name: 'is_portal_user', type: 'boolean', notNull: true, default: false },
    { name: 'revision', type: 'integer', notNull: true, default: 1 },
  ],
  constraints: {
    primaryKey: ['party_id'],
    unique: [['tenant_id', 'party_id']],
    checks: [
      'revision > 0',
      '(tax_id_encrypted IS NULL) = (tax_id_hash IS NULL) AND (tax_id_hash IS NULL) = (tax_id_last4 IS NULL)',
      "tax_id_hash IS NULL OR tax_id_hash ~ '^[0-9a-f]{64}$'",
      "tax_id_last4 IS NULL OR tax_id_last4 ~ '^[0-9]{4}$'",
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['tenant_id', 'party_id'],
        references: {
          schema: 'app',
          table: 'parties',
          columns: ['tenant_id', 'id'],
        },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [{ columns: ['tenant_id', 'tax_id_hash'] }],
  },
};

/** Model for `app.people`. Subject to the tenant row-level security rule. */
export class People extends DirectoryModel {
  static schema = peopleSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, peopleSchema, logger);
  }
  /**
   * Search the tenant's rows with their party kind (M0005 §10 list routes).
   * `text` is an already escaped ILIKE pattern.
   * @param {{tx: object, kinds?: string[]|null, text?: string|null, taxIdHash?: string|null, includeArchived?: boolean}} options
   * @returns {Promise<object[]>}
   */
  async search({
    tx,
    kinds = null,
    text = null,
    taxIdHash = null,
    includeArchived = false,
  }) {
    return tx.any(
      `SELECT x.*, p.kind FROM app.people x JOIN app.parties p ON p.id = x.party_id
        WHERE ($1::text[] IS NULL OR p.kind = ANY($1::text[]))
          AND ($2::text IS NULL OR x.first_name ILIKE $2 OR x.last_name ILIKE $2
               OR (x.first_name || ' ' || x.last_name) ILIKE $2)
          AND ($3::text IS NULL OR x.tax_id_hash = $3)
          AND ($4 OR x.deactivated_at IS NULL)
        ORDER BY x.last_name, x.first_name, x.party_id
        LIMIT 500`,
      [kinds, text, taxIdHash, includeArchived]
    );
  }
}
