/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file The settings row a tenant starts with (M0006-01-R009): no stored
 * values, so every setting is its schema default. Tenant provisioning and
 * Napsoft tenant setup run it as `nap-admin` inside their seed transaction.
 * It is idempotent, so a retried stage finds the row and adds nothing.
 */

/**
 * Create the tenant's settings row if it is missing.
 * @param {object} db Cell repository handle.
 * @param {import('pg-promise').IDatabase<unknown>} tx
 * @param {string} tenantId
 * @returns {Promise<void>}
 */
export async function seedTenantSettings(db, tx, tenantId) {
  if (!(await db.tenant_settings.byTenant(tenantId, { tx })))
    await db.tenant_settings.insert({ tenant_id: tenantId }, { tx });
}

/**
 * Whether the tenant's settings row exists. Writes nothing.
 * @param {object} db
 * @param {import('pg-promise').IDatabase<unknown>} tx
 * @param {string} tenantId
 * @returns {Promise<boolean>}
 */
export async function tenantSettingsPresent(db, tx, tenantId) {
  return Boolean(await db.tenant_settings.byTenant(tenantId, { tx }));
}
