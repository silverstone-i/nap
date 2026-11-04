/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { DirectoryModel } from './directoryModel.js';

/** I0014-R015: what an organization address is for. */
export const ADDRESS_PURPOSES = Object.freeze([
  'location',
  'bill_to',
  'remit_to',
]);

/** I0014-R017: how a bill-to address receives invoices. */
export const DELIVERY_METHODS = Object.freeze(['email', 'mail', 'portal']);

/**
 * Schema object for `app.address_purposes` (I0014 §9): one row per purpose
 * of an organization address, at most one active default per organization
 * and purpose (R016), and a delivery method exactly on bill-to rows (R017).
 * The foreign key to `organizations` keeps purposes off people's addresses.
 * Kept identical to the copy frozen in migration `001-business-directory`.
 */
export const addressPurposesSchema = {
  dbSchema: 'app',
  table: 'address_purposes',
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
    { name: 'address_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'party_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'purpose', type: 'varchar(16)', notNull: true, immutable: true },
    { name: 'is_default', type: 'boolean', notNull: true, default: false },
    { name: 'delivery_method', type: 'varchar(16)' },
    { name: 'revision', type: 'integer', notNull: true, default: 1 },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: [
      'revision > 0',
      "purpose IN ('location', 'bill_to', 'remit_to')",
      "delivery_method IS NULL OR delivery_method IN ('email', 'mail', 'portal')",
      "(delivery_method IS NOT NULL) = (purpose = 'bill_to')",
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['tenant_id', 'address_id'],
        references: {
          schema: 'app',
          table: 'addresses',
          columns: ['tenant_id', 'id'],
        },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['tenant_id', 'party_id'],
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
        columns: ['address_id', 'purpose'],
        unique: true,
        where: 'deactivated_at IS NULL',
      },
      {
        columns: ['party_id', 'purpose'],
        unique: true,
        where: 'is_default AND deactivated_at IS NULL',
      },
      { columns: ['party_id'] },
    ],
  },
};

/** Model for `app.address_purposes`. Subject to the tenant row-level security rule. */
export class AddressPurposes extends DirectoryModel {
  static schema = addressPurposesSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, addressPurposesSchema, logger);
  }
}
