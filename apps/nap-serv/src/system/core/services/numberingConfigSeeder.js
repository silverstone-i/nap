/**
 * @file Numbering config seeder — seeds default numbering configuration per entity type
 * @module core/services/numberingConfigSeeder
 *
 * Called during tenant provisioning after policy catalog seeding.
 * Idempotent — safe to re-run on existing tenants.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import logger from '../../../lib/logger.js';

const DEFAULT_CONFIGS = [
  { id_type: 'employee', prefix: 'EMP', padding: 4, date_mode: 'none', reset_mode: 'never', scope_type: 'none' },
  { id_type: 'vendor', prefix: 'VND', padding: 4, date_mode: 'none', reset_mode: 'never', scope_type: 'none' },
  { id_type: 'client', prefix: 'CLT', padding: 4, date_mode: 'none', reset_mode: 'never', scope_type: 'none' },
  { id_type: 'contact', prefix: 'CON', padding: 4, date_mode: 'none', reset_mode: 'never', scope_type: 'none' },
  { id_type: 'project', prefix: 'PRJ', padding: 4, date_mode: 'none', reset_mode: 'never', scope_type: 'none' },
  {
    id_type: 'ar_invoice',
    prefix: 'INV',
    padding: 5,
    date_mode: 'year',
    reset_mode: 'yearly',
    scope_type: 'legal_entity',
  },
  {
    id_type: 'ap_invoice',
    prefix: 'BILL',
    padding: 5,
    date_mode: 'year',
    reset_mode: 'yearly',
    scope_type: 'legal_entity',
  },
];

/**
 * Seed tenant_numbering_config with one row per entity type.
 * All rows are created with is_enabled = false (opt-in).
 *
 * @param {object} dbInstance pg-promise database connection or transaction
 * @param {object} pgp pg-promise helpers
 * @param {string} schemaName Tenant schema name
 * @param {string} tenantId Tenant UUID
 */
export async function seedNumberingConfig(dbInstance, pgp, schemaName, tenantId) {
  const s = pgp.as.name(schemaName);
  let inserted = 0;

  for (const cfg of DEFAULT_CONFIGS) {
    const existing = await dbInstance.oneOrNone(
      `SELECT id FROM ${s}.tenant_numbering_config WHERE id_type = $1`,
      [cfg.id_type],
    );

    if (!existing) {
      await dbInstance.none(
        `INSERT INTO ${s}.tenant_numbering_config
         (tenant_id, id_type, prefix, suffix, date_mode, reset_mode, padding, separator, uppercase, scope_type, is_enabled)
         VALUES ($1, $2, $3, '', $4, $5, $6, '-', true, $7, false)`,
        [tenantId, cfg.id_type, cfg.prefix, cfg.date_mode, cfg.reset_mode, cfg.padding, cfg.scope_type],
      );
      inserted++;
    }
  }

  logger.info(`Numbering config seeded in ${schemaName}: ${inserted} new entries`);
}
