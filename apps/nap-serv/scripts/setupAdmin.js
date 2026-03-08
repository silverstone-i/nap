/**
 * @file Bootstrap admin schema and NapSoft tenant — creates tables and seeds root tenant + super user
 * @module nap-serv/scripts/setupAdmin
 *
 * Usage: npm -w apps/nap-serv run setupAdmin:dev
 *
 * Steps:
 *   1. Creates admin schema + runs admin-scope migrations (tenants, nap_users, etc.)
 *   2. Provisions the NapSoft tenant schema (CREATE SCHEMA + tenant-scope migrations + RBAC)
 *   3. Seeds the root super user employee in the NapSoft tenant schema and links it to admin.nap_users
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { config as dotenvConfig } from 'dotenv';

// Walk up to find .env
let dir = process.cwd();
while (dir !== dirname(dir)) {
  const envPath = resolve(dir, '.env');
  if (existsSync(envPath)) {
    dotenvConfig({ path: envPath });
    break;
  }
  dir = dirname(dir);
}

async function main() {
  const { DB } = await import('pg-schemata');
  const { default: repositories } = await import('../src/db/repositories.js');
  const { default: logger } = await import('../src/lib/logger.js');
  const { getDatabaseUrl } = await import('../src/lib/envValidator.js');

  const DATABASE_URL = getDatabaseUrl();
  logger.info(`Setting up admin schema on ${process.env.NODE_ENV || 'development'} database...`);

  // Initialize DB if not already done
  if (!DB.db) {
    DB.init(DATABASE_URL, repositories, logger);
  }

  const db = DB.db;

  // Create admin schema if it doesn't exist
  await db.none('CREATE SCHEMA IF NOT EXISTS admin');
  logger.info('Admin schema ensured.');

  // ── Migrate old-format migration history table if present ──────────
  // Previous setupAdmin used PK (id, schema_name); createMigrator uses
  // PK (schema_name, module_name, migration_id). Detect and drop the old
  // table so the migrator can recreate it with the correct structure.
  await db.none('CREATE SCHEMA IF NOT EXISTS pgschemata');
  const hasOldFormat = await db.oneOrNone(`
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'pgschemata' AND table_name = 'migrations' AND column_name = 'id'
      AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'pgschemata' AND table_name = 'migrations' AND column_name = 'module_name'
      )
  `);
  if (hasOldFormat) {
    logger.info('Detected old-format migration history table — dropping for recreation...');
    await db.none('DROP TABLE IF EXISTS pgschemata.migrations');
  }

  // ── Run admin-scope migrations via migrator ────────────────────────
  const { default: migrator } = await import('../src/db/migrations/index.js');
  const { adminModules: adminModuleNames } = await import('../src/db/migrations/moduleScopes.js');

  const adminResult = await migrator.run({
    schema: 'admin',
    modules: adminModuleNames,
    dryRun: false,
    advisoryLock: 424242,
  });

  for (const mod of adminResult.modules) {
    if (mod.applied > 0) {
      logger.info(`Admin migration module "${mod.module}": ${mod.applied} migration(s) applied`);
    }
  }
  logger.info('Admin migrations complete.');

  // ── Provision NapSoft tenant schema ────────────────────────────────
  const rootTenantCode = process.env.ROOT_TENANT_CODE || process.env.NAPSOFT_TENANT || 'NAP';
  const tenantSchema = rootTenantCode.toLowerCase();

  logger.info(`Provisioning NapSoft tenant schema "${tenantSchema}"...`);

  const { provisionTenant } = await import('../src/services/tenantProvisioning.js');
  await provisionTenant({ schemaName: tenantSchema, tenantCode: rootTenantCode });

  logger.info(`NapSoft tenant schema "${tenantSchema}" provisioned.`);

  // ── Link root super user to an employee record ──────────────
  const rootEmail = process.env.ROOT_EMAIL;
  if (rootEmail) {
    const superUser = await db.oneOrNone(
      'SELECT id, entity_type FROM admin.nap_users WHERE email = $1 AND deactivated_at IS NULL',
      [rootEmail],
    );

    if (superUser && !superUser.entity_type) {
      logger.info('Linking root super user to employee record...');

      const tenant = await db.oneOrNone('SELECT id FROM admin.tenants WHERE tenant_code = $1', [rootTenantCode]);

      if (tenant) {
        const s = DB.pgp.as.name(tenantSchema);

        // 1. Insert employee with super_user role
        const employee = await db.one(
          `INSERT INTO ${s}.employees
             (tenant_id, first_name, last_name, email, is_app_user, roles, is_primary_contact)
           VALUES ($1, 'System', 'Administrator', $2, true, '{super_user}', true)
           RETURNING id`,
          [tenant.id, rootEmail],
        );

        // 2. Create polymorphic source record
        const source = await db.one(
          `INSERT INTO ${s}.sources (tenant_id, table_id, source_type, label)
           VALUES ($1, $2, 'employee', 'System Administrator')
           RETURNING id`,
          [tenant.id, employee.id],
        );

        // 3. Link source back to employee
        await db.none(`UPDATE ${s}.employees SET source_id = $1 WHERE id = $2`, [source.id, employee.id]);

        // 4. Link nap_user to employee
        await db.none("UPDATE admin.nap_users SET entity_type = 'employee', entity_id = $1 WHERE id = $2", [
          employee.id,
          superUser.id,
        ]);

        logger.info(`Root super user linked to employee ${employee.id}`);
      }
    } else if (superUser?.entity_type) {
      logger.info('Root super user already linked to entity, skipping.');
    }
  }

  logger.info('Admin setup complete.');
  await db.$pool.end();
}

main().catch((err) => {
  console.error('Admin setup failed:', err);
  process.exit(1);
});
