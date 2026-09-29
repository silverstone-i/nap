/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { DirectoryModel } from './directoryModel.js';

/**
 * Schema object for `app.contact_methods`: emails and phones (M0005-R014). One active primary email and one active primary phone per party.
 * Kept identical to the copy frozen in migration `001-business-directory`.
 */
export const contactMethodsSchema = {
  dbSchema: 'app',
  table: 'contact_methods',
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
    { name: 'party_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'type', type: 'varchar(16)', notNull: true, immutable: true },
    { name: 'value', type: 'varchar(254)', notNull: true },
    { name: 'label_id', type: 'uuid' },
    { name: 'is_primary', type: 'boolean', notNull: true, default: false },
    { name: 'revision', type: 'integer', notNull: true, default: 1 },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: ["type IN ('email', 'phone')", 'revision > 0'],
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
        columns: ['tenant_id', 'label_id'],
        references: {
          schema: 'app',
          table: 'contact_labels',
          columns: ['tenant_id', 'id'],
        },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [
      {
        columns: ['party_id', 'type'],
        unique: true,
        where: 'is_primary AND deactivated_at IS NULL',
      },
      { columns: ['party_id'] },
    ],
  },
};

/** Model for `app.contact_methods`. Subject to the tenant row-level security rule. */
export class ContactMethods extends DirectoryModel {
  static schema = contactMethodsSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, contactMethodsSchema, logger);
  }

  /**
   * The active primary email and phone of each party in `partyIds`.
   * @param {string[]} partyIds
   * @param {{tx: object}} options
   * @returns {Promise<object[]>}
   */
  async primariesFor(partyIds, { tx }) {
    if (partyIds.length === 0) return [];
    return tx.any(
      `SELECT * FROM ${this.schemaName}.${this.tableName}
        WHERE party_id = ANY($1::uuid[]) AND is_primary AND deactivated_at IS NULL`,
      [partyIds]
    );
  }
}
