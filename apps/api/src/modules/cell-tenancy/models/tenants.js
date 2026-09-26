/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { CopyTableModel } from './copyTableModel.js';

/**
 * Schema object for `cell.tenants`: a copy of `admin.tenants` for the tenants in this cell.
 * Kept identical to the copy frozen in migration `001-cell-tenancy`.
 */
export const tenantsSchema = {
  dbSchema: 'cell',
  table: 'tenants',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', notNull: true, immutable: true },
    {
      name: 'tenant_code',
      type: 'varchar(32)',
      notNull: true,
      immutable: true,
    },
    { name: 'status', type: 'text', notNull: true },
    { name: 'revision', type: 'integer', notNull: true },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: ["status IN ('pending', 'active', 'suspended')", 'revision > 0'],
  },
};

/** Model for `cell.tenants`: a copy kept in step by the sync worker (I0004). */
export class Tenants extends CopyTableModel {
  static schema = tenantsSchema;
  static copyColumns = ['tenant_code', 'status'];
  constructor(db, pgp, logger) {
    super(db, pgp, tenantsSchema, logger);
  }

  /**
   * Whether the tenant's copy exists (I0004-R018).
   * @param {string} id
   * @param {{tx: object}} options
   * @returns {Promise<boolean>}
   */
  async exists(id, { tx }) {
    const row = await tx.oneOrNone(
      `SELECT 1 FROM ${this._table()} WHERE id=$1`,
      [id]
    );
    return row !== null;
  }
}
