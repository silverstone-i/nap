/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { DirectoryModel } from './directoryModel.js';

/**
 * Schema object for `app.organization_contacts`: vendor contacts and client contacts (M0005-R004). At most one active primary tax contact per client, and it must hold a tax ID (R009).
 * Kept identical to the copy frozen in migration `001-business-directory`.
 */
export const organizationContactsSchema = {
  dbSchema: 'app',
  table: 'organization_contacts',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  softDelete: true,
  columns: [
    { name: 'party_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'organization_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'full_name', type: 'varchar(255)', notNull: true },
    { name: 'tax_id_encrypted', type: 'text' },
    { name: 'tax_id_hash', type: 'char(64)' },
    { name: 'tax_id_last4', type: 'char(4)' },
    { name: 'is_portal_user', type: 'boolean', notNull: true, default: false },
    {
      name: 'is_primary_tax_contact',
      type: 'boolean',
      notNull: true,
      default: false,
    },
    { name: 'revision', type: 'integer', notNull: true, default: 1 },
  ],
  constraints: {
    primaryKey: ['party_id'],
    checks: [
      'revision > 0',
      '(tax_id_encrypted IS NULL) = (tax_id_hash IS NULL) AND (tax_id_hash IS NULL) = (tax_id_last4 IS NULL)',
      "tax_id_hash IS NULL OR tax_id_hash ~ '^[0-9a-f]{64}$'",
      "tax_id_last4 IS NULL OR tax_id_last4 ~ '^[0-9]{4}$'",
      'NOT is_primary_tax_contact OR tax_id_hash IS NOT NULL',
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
      {
        type: 'ForeignKey',
        columns: ['tenant_id', 'organization_id'],
        references: {
          schema: 'app',
          table: 'organizations',
          columns: ['tenant_id', 'party_id'],
        },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [
      {
        columns: ['organization_id'],
        unique: true,
        where: 'is_primary_tax_contact AND deactivated_at IS NULL',
      },
      { columns: ['organization_id'] },
      { columns: ['tenant_id', 'tax_id_hash'] },
    ],
  },
};

/** Model for `app.organization_contacts`. Subject to the tenant row-level security rule. */
export class OrganizationContacts extends DirectoryModel {
  static schema = organizationContactsSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, organizationContactsSchema, logger);
  }
  /**
   * Search the tenant's rows with their party kind (M0005 §10 list routes).
   * `text` is an already escaped ILIKE pattern.
   * @param {{tx: object, kinds?: string[]|null, text?: string|null, taxIdHash?: string|null, includeArchived?: boolean, organizationId?: string|null}} options
   * @returns {Promise<object[]>}
   */
  async search({
    tx,
    kinds = null,
    text = null,
    taxIdHash = null,
    includeArchived = false,
    organizationId = null,
  }) {
    return tx.any(
      `SELECT x.*, p.kind FROM app.organization_contacts x JOIN app.parties p ON p.id = x.party_id
        WHERE ($1::text[] IS NULL OR p.kind = ANY($1::text[]))
          AND ($2::text IS NULL OR x.full_name ILIKE $2)
          AND ($3::text IS NULL OR x.tax_id_hash = $3)
          AND ($4 OR x.deactivated_at IS NULL)
          AND ($5::uuid IS NULL OR x.organization_id = $5::uuid)
        ORDER BY x.full_name, x.party_id
        LIMIT 500`,
      [kinds, text, taxIdHash, includeArchived, organizationId]
    );
  }
}
