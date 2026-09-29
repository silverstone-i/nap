/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { DirectoryModel } from './directoryModel.js';

/**
 * Schema object for `app.parties`: one row per directory record (M0005-R001). `kind` never changes.
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
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['tenant_id', 'id']],
    checks: [
      "kind IN ('employee', 'contact', 'vendor', 'client', 'vendor_contact', 'client_contact')",
    ],
  },
};

/** Model for `app.parties`. Subject to the tenant row-level security rule. */
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
}
