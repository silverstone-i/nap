/**
 * @file Tenant provisioning service — creates a new tenant schema with all tenant-scope tables
 * @module nap-serv/services/tenantProvisioning
 *
 * When a new tenant is created, this service:
 *   1. Cleans up any stale schema/migration history from a prior failed attempt
 *   2. Creates the PostgreSQL schema
 *   3. Runs all tenant-scope migrations to create tables
 *   4. Seeds default RBAC roles and policies
 *   5. Seeds policy catalog (permission discovery for role-config UI)
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { DB } from 'pg-schemata';
import migrator from '../db/migrations/index.js';
import { tenantModules } from '../db/migrations/moduleScopes.js';
import { seedSystemRoles } from '../system/core/services/systemRoleSeeder.js';
import { seedPolicyCatalog } from '../system/core/services/policyCatalogSeeder.js';
import { seedNumberingConfig } from '../system/core/services/numberingConfigSeeder.js';
import logger from '../lib/logger.js';

const NAPSOFT_TENANT = (process.env.NAPSOFT_TENANT || 'NAP').toUpperCase();

/**
 * Provision a new tenant schema with all tables and default RBAC data.
 * @param {object} options
 * @param {string} options.schemaName The tenant schema name (e.g., 'acme')
 * @param {string} options.tenantCode The tenant code (e.g., 'ACME')
 * @param {string} [options.createdBy=null] Audit trail actor (uuid)
 * @returns {Promise<object>} Migration results
 */
export async function provisionTenant({ schemaName, tenantCode, createdBy: _createdBy = null }) {
  if (!schemaName || typeof schemaName !== 'string') {
    throw new TypeError('provisionTenant requires a schemaName string');
  }

  const normalized = schemaName.toLowerCase().trim();

  const RESERVED_SCHEMAS = new Set(['admin', 'public', 'pgschemata', 'pg_catalog', 'information_schema']);
  if (RESERVED_SCHEMAS.has(normalized) || normalized.startsWith('pg_')) {
    throw new Error(`Cannot provision reserved schema "${normalized}"`);
  }

  logger.info(`Provisioning tenant schema "${normalized}"...`);

  // 1. Clean slate — drop any stale schema and migration history left by a
  //    previous failed provisioning attempt.  This is safe because the caller
  //    (tenantsController.create) has already inserted a new tenant record with
  //    a unique tenant_code, so we know no active tenant owns this schema.
  await DB.db.none(`DROP SCHEMA IF EXISTS ${DB.pgp.as.name(normalized)} CASCADE`);
  try {
    await DB.db.none('DELETE FROM pgschemata.migrations WHERE schema_name = $1', [normalized]);
  } catch {
    // pgschemata.migrations table may not exist on first-ever provisioning —
    // the migrator will create it during the run below.
  }

  // 2. Create the PostgreSQL schema
  await DB.db.none(`CREATE SCHEMA ${DB.pgp.as.name(normalized)}`);

  // 3. Run tenant-scope migrations
  const result = await migrator.run({
    schema: normalized,
    modules: tenantModules,
    dryRun: false,
    advisoryLock: 424242,
  });

  logger.info(`Migrations applied for "${normalized}":`, result);

  // 4. Seed default RBAC roles and policies
  const isNapsoft = tenantCode?.toUpperCase() === NAPSOFT_TENANT;

  try {
    await seedSystemRoles(DB.db, DB.pgp, normalized, tenantCode, isNapsoft);
    logger.info(`RBAC roles seeded for "${normalized}".`);
  } catch (err) {
    logger.warn(`RBAC seeding failed for "${normalized}":`, err?.message || err);
  }

  // 5. Seed policy catalog (permission discovery for role-config UI)
  try {
    await seedPolicyCatalog(DB.db, DB.pgp, normalized, isNapsoft);
  } catch (err) {
    logger.warn(`Policy catalog seeding failed for "${normalized}":`, err?.message || err);
  }

  // 6. Seed default numbering configuration (all disabled — opt-in)
  try {
    const tenant = await DB.db.oneOrNone('SELECT id FROM admin.tenants WHERE schema_name = $1', [normalized]);
    if (tenant) {
      await seedNumberingConfig(DB.db, DB.pgp, normalized, tenant.id);
    }
  } catch (err) {
    logger.warn(`Numbering config seeding failed for "${normalized}":`, err?.message || err);
  }

  return result;
}

export default provisionTenant;
