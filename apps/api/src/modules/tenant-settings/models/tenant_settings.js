/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

/**
 * Schema object for `app.tenant_settings`: one row per tenant holding the
 * general settings it has saved, as a JSON object (M0006-01-R001). Setting
 * names and values are checked by the shared settings schema, not here.
 * Kept identical to the copy frozen in migration `001-tenant-settings`.
 */
export const tenantSettingsSchema = {
  dbSchema: 'app',
  table: 'tenant_settings',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  columns: [
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    {
      name: 'settings',
      type: 'jsonb',
      notNull: true,
      default: "'{}'::jsonb",
    },
    { name: 'revision', type: 'integer', notNull: true, default: 1 },
  ],
  constraints: {
    primaryKey: ['tenant_id'],
    checks: ["jsonb_typeof(settings) = 'object'", 'revision > 0'],
  },
};

/**
 * Model for `app.tenant_settings`. Subject to the tenant row-level security
 * rule, so every statement sees only the transaction's tenant.
 */
export class TenantSettings extends TableModel {
  static schema = tenantSettingsSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, tenantSettingsSchema, logger);
  }

  /**
   * The tenant's row, or null before it is seeded.
   * @param {string} tenantId
   * @param {{tx: object, lock?: boolean}} options
   * @returns {Promise<object|null>}
   */
  async byTenant(tenantId, { tx, lock = false }) {
    return tx.oneOrNone(
      `SELECT * FROM app.tenant_settings WHERE tenant_id = $1${lock ? ' FOR UPDATE' : ''}`,
      [tenantId]
    );
  }

  /**
   * Replace the stored settings and advance `revision`. The caller has
   * locked the row and checked the expected revision.
   * @param {string} tenantId
   * @param {Record<string, unknown>} settings
   * @param {string} actorId Portal user recorded in `updated_by`.
   * @param {{tx: object}} options
   * @returns {Promise<object>} The updated row.
   */
  async saveSettings(tenantId, settings, actorId, { tx }) {
    return tx.one(
      `UPDATE app.tenant_settings
          SET settings = $2::jsonb, revision = revision + 1, updated_by = $3
        WHERE tenant_id = $1
        RETURNING *`,
      [tenantId, JSON.stringify(settings), actorId]
    );
  }
}
