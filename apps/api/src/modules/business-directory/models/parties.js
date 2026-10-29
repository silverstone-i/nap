/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { DirectoryModel } from './directoryModel.js';

/**
 * Schema object for `app.parties`: one row per directory record (M0005-R001). `kind` never changes.
 * A record's tax ID lives here, only in its protected form, with the format it was entered in (R010, R038); a vendor contact never has one (R008).
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
    { name: 'tax_id_format_id', type: 'uuid' },
    { name: 'tax_id_encrypted', type: 'text' },
    { name: 'tax_id_hash', type: 'char(64)' },
    { name: 'tax_id_last4', type: 'char(4)' },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['tenant_id', 'id']],
    checks: [
      "kind IN ('employee', 'contact', 'vendor', 'client', 'vendor_contact', 'client_contact')",
      '(tax_id_encrypted IS NULL) = (tax_id_hash IS NULL) AND (tax_id_hash IS NULL) = (tax_id_last4 IS NULL) AND (tax_id_last4 IS NULL) = (tax_id_format_id IS NULL)',
      "tax_id_hash IS NULL OR tax_id_hash ~ '^[0-9a-f]{64}$'",
      "tax_id_last4 IS NULL OR tax_id_last4 ~ '^[0-9A-Z]{4}$'",
      "kind <> 'vendor_contact' OR tax_id_hash IS NULL",
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['tenant_id', 'tax_id_format_id'],
        references: {
          schema: 'app',
          table: 'tax_id_formats',
          columns: ['tenant_id', 'id'],
        },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [
      { columns: ['tenant_id', 'tax_id_hash'] },
      // R047: one holder per tenant, kind, and tax ID, archived records
      // included; client contacts are exempt.
      {
        columns: ['tenant_id', 'kind', 'tax_id_hash'],
        unique: true,
        where: "kind <> 'client_contact' AND tax_id_hash IS NOT NULL",
      },
      { columns: ['tax_id_format_id'] },
    ],
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
          SET tax_id_format_id = $2, tax_id_encrypted = $3, tax_id_hash = $4,
              tax_id_last4 = $5, updated_by = $6
        WHERE id = $1
        RETURNING *`,
      [
        id,
        columns.tax_id_format_id,
        columns.tax_id_encrypted,
        columns.tax_id_hash,
        columns.tax_id_last4,
        actorId,
      ]
    );
  }

  /**
   * The party of `kind` holding a tax ID hash, other than `excludeId`,
   * archived records included (M0005-R047). A record is archived when its
   * child row is.
   * @param {string} kind
   * @param {string} hash
   * @param {string|null} excludeId
   * @param {{tx: object}} options
   * @returns {Promise<{id: string, archived: boolean}|null>}
   */
  async holderOfTaxId(kind, hash, excludeId, { tx }) {
    return tx.oneOrNone(
      `SELECT p.id,
              NOT EXISTS (
                SELECT 1 FROM app.people x
                 WHERE x.party_id = p.id AND x.deactivated_at IS NULL
                UNION ALL
                SELECT 1 FROM app.organizations x
                 WHERE x.party_id = p.id AND x.deactivated_at IS NULL
              ) AS archived
         FROM app.parties p
        WHERE p.kind = $1 AND p.tax_id_hash = $2
          AND ($3::uuid IS NULL OR p.id <> $3::uuid)
        LIMIT 1`,
      [kind, hash, excludeId]
    );
  }

  /**
   * Name, kind, and archived state of each party in `ids`, with an
   * organization contact's organization, ordered by name and capped at
   * `limit` (M0005-R066). A person's name is first and last name, an
   * organization's its legal name; a record is archived when its child row
   * is.
   * @param {string[]} ids
   * @param {number} limit
   * @param {{tx: object}} options
   * @returns {Promise<object[]>}
   */
  async summaries(ids, limit, { tx }) {
    if (ids.length === 0) return [];
    return tx.any(
      `SELECT p.id, p.kind,
              COALESCE(pe.first_name || ' ' || pe.last_name, o.legal_name) AS name,
              COALESCE(pe.deactivated_at, o.deactivated_at) IS NOT NULL AS archived,
              org.party_id AS organization_id,
              org.legal_name AS organization_name,
              org.deactivated_at IS NOT NULL AS organization_archived
         FROM app.parties p
         LEFT JOIN app.people pe ON pe.party_id = p.id
         LEFT JOIN app.organizations o ON o.party_id = p.id
         LEFT JOIN app.organizations org ON org.party_id = pe.organization_id
        WHERE p.id = ANY($1::uuid[])
        ORDER BY name, p.id
        LIMIT $2`,
      [ids, limit]
    );
  }
}
