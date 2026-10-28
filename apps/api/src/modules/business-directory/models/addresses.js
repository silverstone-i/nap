/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { DirectoryModel } from './directoryModel.js';

/** The columns an address matches on (R063), in key order. */
const MATCH_COLUMNS = [
  'line1',
  'line2',
  'city',
  'region',
  'postal_code',
  'country',
];

/**
 * R063: an address's match key over `ref(column)` for each column. Fields
 * are saved with whitespace collapsed, so matching ignores only case; empty
 * fields count as equal. Hashed so the key stays under the btree row limit.
 * @param {(column: string) => string} ref
 * @returns {string}
 */
const matchKey = ref =>
  `md5(lower(${MATCH_COLUMNS.map(c => `coalesce(${ref(c)}, '')`).join(' || chr(31) || ')}))`;

/**
 * Schema object for `app.addresses`: addresses (M0005-R015). One active primary address per party, and no two matching active addresses (R063).
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
      {
        name: 'uidx_addresses_party_id_match',
        columns: ['party_id', { expression: matchKey(c => c) }],
        unique: true,
        where: 'deactivated_at IS NULL',
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

  /**
   * Another active address of the party matching `address` (R063).
   * @param {{partyId: string, address: {line1: string, line2: string|null, city: string, region: string|null, postal_code: string|null, country: string}, excludeId: string|null}} match
   * @param {{tx: object}} options
   * @returns {Promise<object|null>}
   */
  async activeMatch({ partyId, address, excludeId }, { tx }) {
    return tx.oneOrNone(
      `SELECT id FROM ${this.schemaName}.${this.tableName}
        WHERE party_id = $<partyId> AND deactivated_at IS NULL
          AND id IS DISTINCT FROM $<excludeId>
          AND ${matchKey(c => c)} = ${matchKey(c => `$<${c}>::text`)}
        LIMIT 1`,
      { ...address, partyId, excludeId }
    );
  }
}
