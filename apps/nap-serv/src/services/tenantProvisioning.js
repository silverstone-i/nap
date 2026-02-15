/**
 * @file Tenant provisioning service — creates a new tenant schema with all tenant-scope tables
 * @module nap-serv/services/tenantProvisioning
 *
 * When a new tenant is created, this service:
 *   1. Creates the PostgreSQL schema (CREATE SCHEMA IF NOT EXISTS)
 *   2. Runs all tenant-scope migrations to create tables
 *   3. Seeds default RBAC roles and policies
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { DB } from 'pg-schemata';
import migrator from '../db/migrations/index.js';
import { tenantModules } from '../db/migrations/moduleScopes.js';
import { seedRbac } from '../modules/core/seeds/seed_rbac.js';
import logger from '../utils/logger.js';

/**
 * Provision a new tenant schema with all tables and default RBAC data.
 * @param {object} options
 * @param {string} options.schemaName The tenant schema name (e.g., 'acme')
 * @param {string} [options.createdBy='provisioning'] Audit trail actor
 * @returns {Promise<object>} Migration results
 */
export async function provisionTenant({ schemaName, createdBy = 'provisioning' }) {
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
  try {
    await seedRbac({ schemaName: normalized, createdBy });
    logger.info(`RBAC seeded for "${normalized}".`);
  } catch (err) {
    logger.warn(`RBAC seeding failed for "${normalized}":`, err?.message || err);
  }

  return result;
}

export default provisionTenant;
