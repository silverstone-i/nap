/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { DirectoryModel } from './directoryModel.js';

/**
 * Schema object for `app.parties`: one row per directory record (M0005-R001). `kind` never changes.
 * A record's tax ID lives here, only in its protected form (R010); a vendor contact never has one (R008).
 * Kept identical to the copy frozen in migration `001-business-directory`.
 */
export const partiesSchema = {
  dbSchema: 'app',
  table: 'parties',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  columns: [
    {
      name: 'id',
      type: 'uuid',
      notNull: true,
      default: 'gen_random_uuid()',
      immutable: true,
    },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'kind', type: 'varchar(32)', notNull: true, immutable: true },
    { name: 'tax_id_encrypted', type: 'text' },
    { name: 'tax_id_hash', type: 'char(64)' },
    { name: 'tax_id_last4', type: 'char(4)' },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['tenant_id', 'id']],
    checks: [
      "kind IN ('employee', 'contact', 'vendor', 'client', 'vendor_contact', 'client_contact')",
      '(tax_id_encrypted IS NULL) = (tax_id_hash IS NULL) AND (tax_id_hash IS NULL) = (tax_id_last4 IS NULL)',
      "tax_id_hash IS NULL OR tax_id_hash ~ '^[0-9a-f]{64}$'",
      "tax_id_last4 IS NULL OR tax_id_last4 ~ '^[0-9]{4}$'",
      "kind <> 'vendor_contact' OR tax_id_hash IS NULL",
    ],
    indexes: [{ columns: ['tenant_id', 'tax_id_hash'] }],
  },
};

export class Parties extends DirectoryModel {
  static schema = partiesSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, partiesSchema, logger);
  }

  /**
   * Insert a party with a chosen ID. Tenant provisioning names the first
   * administrator's party after the membership's `member_id` (M0005-R021);
   * `insert` would let the column default pick one instead.
   * @param {{id: string, tenant_id: string, kind: string}} row
   * @param {{tx: object}} options
   * @returns {Promise<object>}
   */
  async insertWithId({ id, tenant_id, kind }, { tx }) {
    return tx.one(
      `INSERT INTO ${this.schemaName}.${this.tableName} (id, tenant_id, kind)
       VALUES ($1, $2, $3) RETURNING *`,
      [id, tenant_id, kind]
    );
  }

  /**
   * Store a party's protected tax ID columns, or clear them with nulls.
   * The record's child row carries its revision; the caller advances it.
   * @param {string} id
   * @param {{tax_id_encrypted: string|null, tax_id_hash: string|null, tax_id_last4: string|null}} columns
   * @param {string|null} actorId Portal user recorded in `updated_by`.
   * @param {{tx: object}} options
   * @returns {Promise<object>} The updated party.
   */
  async setTaxId(id, columns, actorId, { tx }) {
    return tx.one(
      `UPDATE ${this.schemaName}.${this.tableName}
          SET tax_id_encrypted = $2, tax_id_hash = $3, tax_id_last4 = $4,
              updated_by = $5
        WHERE id = $1
        RETURNING *`,
      [
        id,
        columns.tax_id_encrypted,
        columns.tax_id_hash,
        columns.tax_id_last4,
        actorId,
      ]
    );
  }

  /**
   * Parties of active records holding a tax ID hash, other than `excludeId`
   * (M0005-R013). A record is active while its child row is.
   * @param {string} hash
   * @param {string|null} excludeId
   * @param {{tx: object}} options
   * @returns {Promise<string[]>} Their IDs.
   */
  async holdersOfTaxId(hash, excludeId, { tx }) {
    return tx.map(
      `SELECT p.id FROM app.parties p
        WHERE p.tax_id_hash = $1
          AND ($2::uuid IS NULL OR p.id <> $2::uuid)
          AND (EXISTS (SELECT 1 FROM app.people x
                        WHERE x.party_id = p.id AND x.deactivated_at IS NULL)
               OR EXISTS (SELECT 1 FROM app.organizations x
                           WHERE x.party_id = p.id AND x.deactivated_at IS NULL))
        ORDER BY p.id`,
      [hash, excludeId],
      row => row.id
    );
  }
}
