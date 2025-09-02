'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import { db, pgp } from '../src/db/db.js';
// import { loadViews } from './loadViews.js';
const { seedRbac } = await import('../src/seeds/seed_rbac.js');
const { bootstrapSuperAdmin } = await import('./bootstrapSuperAdmin.js');
import { isValidModel, topoSortModels } from './lib/models.js';

// Helpers moved to ./lib/models.js

async function migrateTenants({ schemaList = [], dbOverride = db, pgpOverride = pgp, testFlag = false } = {}) {
  // Check if schema exists in the database
  async function schemaExists(schemaName) {
    const result = await dbOverride.oneOrNone(`SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`, [schemaName]);
    return !!result;
  }

  const adminTables = ['admin.tenants', 'admin.nap_users', 'admin.match_review_logs'];
  // dependency graph disabled for now
  try {
    // Acquire advisory lock to prevent concurrent migrations (use a stable key)
    const lockKey = 424242; // arbitrary app-wide lock id
    const gotLock = await dbOverride.one(`SELECT pg_try_advisory_lock($1) AS locked`, [lockKey]);
    if (!gotLock.locked) {
      throw new Error('Another migration is currently running (advisory lock not acquired).');
    }
    // Rule 1: If admin schema does not exist, run bootstrapSuperAdmin which creates tables and seeds RBAC
    const adminExists = await schemaExists('admin');
    if (!adminExists) {
      console.log('🧰 Admin schema missing. Bootstrapping super admin and base schemas...');
      await bootstrapSuperAdmin();
    }

    // Quote identifiers safely
    const qn = (name) => pgp.as.name(name);

    // Rule 2 + desired behavior: If admin is in the list, drop it and re-bootstrap after
    const willResetAdmin = schemaList.includes('admin');

    for (const schemaName of schemaList) {
      console.log(`🧨 Dropping schema if exists: ${schemaName}`);
      await dbOverride.none(`DROP SCHEMA IF EXISTS ${qn(schemaName)} CASCADE;`);
      await dbOverride.none(`CREATE SCHEMA IF NOT EXISTS ${qn(schemaName)};`);
    }

    for (const schemaName of schemaList) {
      const createdAdminTables = new Set();

      const allowedAdminTables = new Set(adminTables.map((t) => t.toLowerCase()));

      const modelsForSchema = Object.fromEntries(
        Object.entries(dbOverride)
          .filter(([, model]) => {
            if (!isValidModel(model)) return false;
            const originalSchema = `${model.schema?.dbSchema}.${model.schema?.table}`.toLowerCase();
            const isAdminTable = allowedAdminTables.has(originalSchema);
            const effectiveSchema = isAdminTable ? 'admin' : schemaName;
            const schemaScopedModel = dbOverride(model, effectiveSchema);
            const fullName = `${schemaScopedModel.schema.dbSchema}.${schemaScopedModel.schema.table}`.toLowerCase();

            // Rule 2b: load all tables where table schema is not 'admin'
            if (schemaName === 'admin') {
              // For admin schema, only include admin tables
              return fullName.startsWith('admin.');
            }

            if (fullName.startsWith('admin.')) return false; // skip admin tables for tenant schemas

            return true;
          })
          .map(([, model]) => {
            const originalSchema = `${model.schema?.dbSchema}.${model.schema?.table}`.toLowerCase();
            const isAdminTable = allowedAdminTables.has(originalSchema);
            const effectiveSchema = isAdminTable ? 'admin' : schemaName;
            const schemaScopedModel = dbOverride(model, effectiveSchema);
            return [`${schemaScopedModel.schema.dbSchema}.${schemaScopedModel.schema.table}`.toLowerCase(), schemaScopedModel];
          }),
      );
      // console.log('✅ Models for schema', schemaName, Object.keys(modelsForSchema));
      const keys = topoSortModels(modelsForSchema);
      // console.log('🧭 Sorted model keys for', schemaName, keys);

      // Run table creation inside a transaction per schema
      await dbOverride.tx(async (_t) => {
        for (const key of keys) {
          const model = modelsForSchema[key];
          const isAdminTable = model.schema.dbSchema === 'admin';
          if (model?.constructor?.isViewModel) continue;
          if (isAdminTable && schemaName !== 'admin') continue; // never create admin tables in tenant schemas
          if (!isAdminTable && schemaName === 'admin') continue; // only admin tables in admin schema
          await dbOverride(model, schemaName).createTable();
          if (schemaName === 'admin') {
            createdAdminTables.add(key);
          }
        }
      });

      // createdAdminTablesSet not needed after RBAC seeding adjustment

      // Rule 3: Seed RBAC for every schema added (including admin)
      try {
        if (!(schemaName === 'admin' && willResetAdmin)) {
          await seedRbac({ schemaName, createdBy: 'migrateTenants' });
        }
      } catch (e) {
        console.warn(`Warning: failed seeding RBAC for schema ${schemaName}:`, e?.message || e);
      }

      // await loadViews(dbOverride, schemaName);
      // console.log(`Views loaded for schema: ${schemaName}`);
    }
    // If admin was reset, re-bootstrap to restore root user and default tenant
    if (willResetAdmin) {
      await bootstrapSuperAdmin();
    }
  } catch (error) {
    console.error('Error during migration:', error.message);
    console.error('Stack trace:', error.stack);
    if (testFlag) {
      throw error;
    }
  } finally {
    // Release advisory lock
    try {
      await dbOverride.none(`SELECT pg_advisory_unlock($1)`, [424242]);
    } catch {
      // ignore unlock errors
    }
    // writeDependencyGraph can be re-enabled when needed
    if (!testFlag) {
      await pgpOverride.end();
    }
    console.log('Database connection closed.\n');
    console.log('Migration completed.');
  }
}

export { migrateTenants };
export default migrateTenants;
