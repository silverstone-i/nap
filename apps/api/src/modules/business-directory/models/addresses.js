/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { DirectoryModel } from './directoryModel.js';

/**
 * Schema object for `app.addresses`: addresses (M0005-R015). One active primary address per party.
 * Kept identical to the copy frozen in migration `001-business-directory`.
 */
export const addressesSchema = {
  dbSchema: 'app',
  table: 'addresses',
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
    { name: 'line1', type: 'varchar(255)', notNull: true },
    { name: 'line2', type: 'varchar(255)' },
    { name: 'city', type: 'varchar(120)', notNull: true },
    { name: 'region', type: 'varchar(120)' },
    { name: 'postal_code', type: 'varchar(32)' },
    { name: 'country', type: 'char(2)', notNull: true },
    { name: 'label_id', type: 'uuid' },
    { name: 'is_primary', type: 'boolean', notNull: true, default: false },
    { name: 'revision', type: 'integer', notNull: true, default: 1 },
  ],
  constraints: {
    primaryKey: ['id'],
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
    indexes: [
      {
        columns: ['party_id'],
        unique: true,
        where: 'is_primary AND deactivated_at IS NULL',
      },
      { columns: ['party_id'] },
    ],
  },
};

/** Model for `app.addresses`. Subject to the tenant row-level security rule. */
export class Addresses extends DirectoryModel {
  static schema = addressesSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, addressesSchema, logger);
  }
}
