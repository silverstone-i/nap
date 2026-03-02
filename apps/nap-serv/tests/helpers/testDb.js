/**
 * @file Test database helper — provides isolated DB setup for integration tests
 * @module tests/helpers/testDb
 *
 * Initializes the test database, runs bootstrap migration, and provides
 * cleanup. Tests must use NODE_ENV=test which resolves to nap_test database.
 *
 * Performance: admin schema + tables are created ONCE per test-suite run
 * (via `adminReady` flag). Between test files only tenant schemas are
 * dropped and admin data is reset to the root-only bootstrap state,
 * avoiding expensive repeated DDL operations.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
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

// Set test env vars for auth
process.env.ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || 'test-access-secret-32chars-long!!';
process.env.REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'test-refresh-secret-32chars-long!';
process.env.ROOT_EMAIL = process.env.ROOT_EMAIL || 'admin@napsoft.com';
process.env.ROOT_PASSWORD = process.env.ROOT_PASSWORD || 'TestPass123!';
process.env.ROOT_TENANT_CODE = process.env.ROOT_TENANT_CODE || 'NAP';
process.env.ROOT_COMPANY = process.env.ROOT_COMPANY || 'NapSoft LLC';
process.env.BCRYPT_ROUNDS = '4'; // Fast for tests

import { DB } from 'pg-schemata';
import { getDatabaseUrl } from '../../src/lib/envValidator.js';
import repositories from '../../src/db/repositories.js';
import logger from '../../src/lib/logger.js';

let initialized = false;
let adminReady = false;
let _cachedPasswordHash = null;

/**
 * Initialize the test database connection.
 */
export async function initTestDb() {
  if (initialized) return DB.db;

  const DATABASE_URL = getDatabaseUrl();
  if (!DB.db) {
    DB.init(DATABASE_URL, repositories, logger);
  }
  initialized = true;
  return DB.db;
}

// ── Internal helpers ──────────────────────────────────────────────────

/**
 * Returns a cached bcrypt hash of the root password to avoid re-hashing
 * on every test-file boundary.
 */
async function getCachedPasswordHash() {
  if (!_cachedPasswordHash) {
    const { default: bcrypt } = await import('bcrypt');
    const rounds = parseInt(process.env.BCRYPT_ROUNDS || '4', 10);
    _cachedPasswordHash = await bcrypt.hash(process.env.ROOT_PASSWORD || 'TestPass123!', rounds);
  }
  return _cachedPasswordHash;
}

/**
 * Re-seed the root tenant and super user into an existing (but empty)
 * admin schema. Called by bootstrapAdmin when adminReady is true.
 */
async function reseedAdmin(db) {
  const rootTenantCode = process.env.ROOT_TENANT_CODE || 'NAP';
  const rootCompany = process.env.ROOT_COMPANY || 'NapSoft LLC';
  const rootSchema = rootTenantCode.toLowerCase();
  const rootEmail = process.env.ROOT_EMAIL || 'admin@napsoft.com';
  const passwordHash = await getCachedPasswordHash();

  const existingTenant = await db.oneOrNone('SELECT id FROM admin.tenants WHERE tenant_code = $1', [rootTenantCode]);

  if (!existingTenant) {
    await db.none(
      `INSERT INTO admin.tenants (tenant_code, company, schema_name, status, tier, allowed_modules)
       VALUES ($1, $2, $3, 'active', 'enterprise', $4)`,
      [rootTenantCode, rootCompany, rootSchema, JSON.stringify([])],
    );
  }

  const tenant = await db.one('SELECT id FROM admin.tenants WHERE tenant_code = $1', [rootTenantCode]);

  const existingUser = await db.oneOrNone(
    'SELECT id FROM admin.nap_users WHERE email = $1 AND deactivated_at IS NULL',
    [rootEmail],
  );

  if (!existingUser) {
    await db.none(
      `INSERT INTO admin.nap_users (tenant_id, entity_type, entity_id, email, password_hash, status)
       VALUES ($1, NULL, NULL, $2, $3, 'active')`,
      [tenant.id, rootEmail, passwordHash],
    );
  }
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Run the admin bootstrap migration on the test database.
 *
 * On the first call (per test-suite run) this performs the full DDL:
 * create schemas, create tables via the bootstrap migration, and seed
 * root data. On subsequent calls it only re-seeds root data (the
 * schema + tables persist from the first call).
 */
export async function bootstrapAdmin() {
  const db = await initTestDb();

  if (adminReady) {
    // Admin schema + tables already exist — just ensure root data is present
    await reseedAdmin(db);
    return db;
  }

  // Create schemas
  await db.none('CREATE SCHEMA IF NOT EXISTS admin');
  await db.none('CREATE SCHEMA IF NOT EXISTS pgschemata');

  // Create migration history table (must match createMigrator.js schema)
  await db.none(`
    CREATE TABLE IF NOT EXISTS pgschemata.migrations (
      schema_name TEXT NOT NULL,
      module_name TEXT NOT NULL,
      migration_id TEXT NOT NULL,
      checksum TEXT,
      description TEXT,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (schema_name, module_name, migration_id)
    )
  `);

  // Run bootstrap migration
  const { default: bootstrapMigration } = await import(
    '../../src/system/auth/schema/migrations/202502110001_bootstrapAdmin.js'
  );

  const models = {};
  for (const [key, ModelClass] of Object.entries(repositories)) {
    models[key] = new ModelClass(db, DB.pgp, logger);
  }

  await bootstrapMigration.up({
    schema: 'admin',
    models,
    db,
    ensureExtensions: async (exts) => {
      for (const ext of exts) {
        await db.none(`CREATE EXTENSION IF NOT EXISTS "${ext}" CASCADE`);
      }
    },
  });

  adminReady = true;
  return db;
}

/**
 * Clean up test database.
 *
 * Always drops any test-provisioned tenant schemas. When admin has
 * already been bootstrapped (`adminReady`) it preserves the admin
 * schema structure and only truncates data + clears non-admin
 * migration history. On the very first call (before any bootstrap)
 * it drops admin + pgschemata entirely so bootstrapAdmin() starts
 * from a clean slate.
 */
export async function cleanupTestDb() {
  const db = await initTestDb();

  // Drop any test-created tenant schemas (provisioned during tests)
  const testSchemas = await db.manyOrNone(
    `SELECT schema_name FROM information_schema.schemata
     WHERE schema_name NOT IN ('public', 'admin', 'pgschemata', 'pg_catalog',
                                'information_schema', 'pg_toast')
       AND schema_name NOT LIKE 'pg_%'`,
  );
  for (const row of testSchemas) {
    await db.none(`DROP SCHEMA IF EXISTS ${db.$config.pgp.as.name(row.schema_name)} CASCADE`);
  }

  if (adminReady) {
    // Admin schema persists — truncate all admin tables (FK-safe) and
    // clear non-admin migration history. Tables + types remain intact.
    const adminTables = await db.manyOrNone(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'admin' AND table_type = 'BASE TABLE'",
    );
    if (adminTables.length) {
      const tableList = adminTables.map((r) => `admin.${DB.pgp.as.name(r.table_name)}`).join(', ');
      await db.none(`TRUNCATE ${tableList} CASCADE`);
    }
    await db.none("DELETE FROM pgschemata.migrations WHERE schema_name != 'admin'");
  } else {
    // First run: full reset (handles stale state from a previous test run)
    await db.none('DROP SCHEMA IF EXISTS admin CASCADE');
    await db.none('DROP SCHEMA IF EXISTS pgschemata CASCADE');
  }
}

/**
 * Close the database connection pool.
 */
export async function closeTestDb() {
  if (DB.db) {
    await DB.db.$pool.end();
  }
}

export { DB };
