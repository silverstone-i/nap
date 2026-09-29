/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { DirectoryModel } from './directoryModel.js';

/**
 * Schema object for `app.organizations`: vendors and clients (M0005-R003). A vendor needs a tax ID (R006); a client has a tax ID or a primary tax contact (R007).
 * Kept identical to the copy frozen in migration `001-business-directory`.
 */
export const organizationsSchema = {
  dbSchema: 'app',
  table: 'organizations',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  softDelete: true,
  columns: [
    { name: 'party_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'legal_name', type: 'varchar(255)', notNull: true },
    { name: 'dba_name', type: 'varchar(255)' },
    { name: 'tax_id_encrypted', type: 'text' },
    { name: 'tax_id_hash', type: 'char(64)' },
    { name: 'tax_id_last4', type: 'char(4)' },
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

/** Model for `app.organizations`. Subject to the tenant row-level security rule. */
export class Organizations extends DirectoryModel {
  static schema = organizationsSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, organizationsSchema, logger);
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
      `SELECT x.*, p.kind FROM app.organizations x JOIN app.parties p ON p.id = x.party_id
        WHERE ($1::text[] IS NULL OR p.kind = ANY($1::text[]))
          AND ($2::text IS NULL OR x.legal_name ILIKE $2 OR x.dba_name ILIKE $2)
          AND ($3::text IS NULL OR x.tax_id_hash = $3)
          AND ($4 OR x.deactivated_at IS NULL)
        ORDER BY x.legal_name, x.party_id
        LIMIT 500`,
      [kinds, text, taxIdHash, includeArchived]
    );
  }
}
