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
    { name: 'revision', type: 'integer', notNull: true, default: 1 },
  ],
  constraints: {
    primaryKey: ['party_id'],
    unique: [['tenant_id', 'party_id']],
    checks: ['revision > 0'],
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
  },
};

export class Organizations extends DirectoryModel {
  static schema = organizationsSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, organizationsSchema, logger);
  }

  /**
   * Search the tenant's rows with their party kind and tax ID columns
   * (M0005 §10 list routes). `text` is an already escaped ILIKE pattern.
   * With `limit`, returns one page in name order, resuming after the row
   * `after` names (R027). With no `limit`, returns every match.
   * @param {{tx: object, kinds?: string[]|null, text?: string|null, taxIdHash?: string|null, includeArchived?: boolean, limit?: number|null, after?: string|null}} options
   * @returns {Promise<object[]>}
   */
  async search({
    tx,
    kinds = null,
    text = null,
    taxIdHash = null,
    includeArchived = false,
    limit = null,
    after = null,
  }) {
    return tx.any(
      `SELECT x.*, p.kind, p.tax_id_encrypted, p.tax_id_hash, p.tax_id_last4 FROM app.organizations x JOIN app.parties p ON p.id = x.party_id
        WHERE ($1::text[] IS NULL OR p.kind = ANY($1::text[]))
          AND ($2::text IS NULL OR x.legal_name ILIKE $2 OR x.dba_name ILIKE $2)
          AND ($3::text IS NULL OR p.tax_id_hash = $3)
          AND ($4 OR x.deactivated_at IS NULL)
          AND ($5::uuid IS NULL OR (x.legal_name, x.party_id) >
               (SELECT a.legal_name, a.party_id
                  FROM app.organizations a WHERE a.party_id = $5::uuid))
        ORDER BY x.legal_name, x.party_id
        LIMIT $6`,
      [kinds, text, taxIdHash, includeArchived, after, limit]
    );
  }
}
