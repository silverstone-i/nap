/**
 * @file Tenant provisioning service — creates a new tenant schema with all tenant-scope tables
 * @module nap-serv/services/tenantProvisioning
 *
 * When a new tenant is created, this service:
 *   1. Creates the PostgreSQL schema (CREATE SCHEMA IF NOT EXISTS)
 *   2. Runs all tenant-scope migrations to create tables
 *   3. Seeds default RBAC roles and policies
 *   4. Seeds policy catalog (permission discovery for role-config UI)
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { DB } from 'pg-schemata';
import migrator from '../db/migrations/index.js';
import { tenantModules } from '../db/migrations/moduleScopes.js';
import { seedSystemRoles } from '../modules/core/services/systemRoleSeeder.js';
import { seedPolicyCatalog } from '../modules/core/services/policyCatalogSeeder.js';
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

  if (normalized === 'admin' || normalized === 'public' || normalized === 'pgschemata') {
    throw new Error(`Cannot provision reserved schema "${normalized}"`);
  }

  logger.info(`Provisioning tenant schema "${normalized}"...`);

  // 1. Create the PostgreSQL schema
  await DB.db.none(`CREATE SCHEMA IF NOT EXISTS ${DB.pgp.as.name(normalized)}`);

  // 2. Run tenant-scope migrations
  const result = await migrator.run({
    schema: normalized,
    modules: tenantModules,
    dryRun: false,
    advisoryLock: 424242,
  });

  logger.info(`Migrations applied for "${normalized}":`, result);

  // 3. Seed default RBAC roles and policies
  const isNapsoft = tenantCode?.toUpperCase() === NAPSOFT_TENANT;

  try {
    await seedSystemRoles(DB.db, DB.pgp, normalized, tenantCode, isNapsoft);
    logger.info(`RBAC roles seeded for "${normalized}".`);
  } catch (err) {
    logger.warn(`RBAC seeding failed for "${normalized}":`, err?.message || err);
  }

  // 4. Seed policy catalog (permission discovery for role-config UI)
  try {
    await seedPolicyCatalog(DB.db, DB.pgp, normalized);
  } catch (err) {
    logger.warn(`Policy catalog seeding failed for "${normalized}":`, err?.message || err);
  }

  return result;
}

export default provisionTenant;
