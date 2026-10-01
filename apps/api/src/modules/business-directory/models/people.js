/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { DirectoryModel } from './directoryModel.js';

/**
 * Schema object for `app.people`: employees and contacts, and vendor and
 * client contacts with their `organization_id` (M0005-R002, R004). Only an
 * organization contact can be flagged `is_primary_contact` or
 * `is_billing_contact`, naming that organization's primary and billing
 * contacts; any number may hold each. Only a client contact can be its
 * client's primary tax contact (R009).
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
    { name: 'organization_id', type: 'uuid', immutable: true },
    { name: 'first_name', type: 'varchar(160)', notNull: true },
    { name: 'last_name', type: 'varchar(160)', notNull: true },
    {
      name: 'is_portal_user',
      type: 'boolean',
      notNull: true,
      default: false,
    },
    {
      name: 'is_primary_contact',
      type: 'boolean',
      notNull: true,
      default: false,
    },
    {
      name: 'is_billing_contact',
      type: 'boolean',
      notNull: true,
      default: false,
    },
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
    unique: [['tenant_id', 'party_id']],
    checks: [
      'revision > 0',
      'NOT is_primary_tax_contact OR organization_id IS NOT NULL',
      'organization_id IS NOT NULL OR NOT (is_primary_contact OR is_billing_contact)',
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
    ],
  },
};

export class People extends DirectoryModel {
  static schema = peopleSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, peopleSchema, logger);
  }

  /**
   * Search the tenant's rows with their party kind and tax ID columns
   * (M0005 §10 list routes). `text` is an already escaped ILIKE pattern.
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
      `SELECT x.*, p.kind, p.tax_id_encrypted, p.tax_id_hash, p.tax_id_last4 FROM app.people x JOIN app.parties p ON p.id = x.party_id
        WHERE ($1::text[] IS NULL OR p.kind = ANY($1::text[]))
          AND ($2::text IS NULL OR x.first_name ILIKE $2 OR x.last_name ILIKE $2
               OR (x.first_name || ' ' || x.last_name) ILIKE $2)
          AND ($3::text IS NULL OR p.tax_id_hash = $3)
          AND ($4 OR x.deactivated_at IS NULL)
          AND ($5::uuid IS NULL OR x.organization_id = $5::uuid)
        ORDER BY x.last_name, x.first_name, x.party_id
        LIMIT 500`,
      [kinds, text, taxIdHash, includeArchived, organizationId]
    );
  }
}
