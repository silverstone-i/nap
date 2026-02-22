/**
 * @file Test database helper — provides isolated DB setup for integration tests
 * @module tests/helpers/testDb
 *
 * Initializes the test database, runs bootstrap migration, and provides
 * cleanup. Tests must use NODE_ENV=test which resolves to nap_test database.
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

/**
 * Run the admin bootstrap migration on the test database.
 */
export async function bootstrapAdmin() {
  const db = await initTestDb();

  // Create schemas
  await db.none('CREATE SCHEMA IF NOT EXISTS admin');
  await db.none('CREATE SCHEMA IF NOT EXISTS pgschemata');

  // Create migration history table
  await db.none(`
    CREATE TABLE IF NOT EXISTS pgschemata.migrations (
      id TEXT NOT NULL,
      schema_name TEXT NOT NULL,
      description TEXT,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (id, schema_name)
    )
  `);

  // Run bootstrap migration
  const { default: bootstrapMigration } = await import(
    '../../src/modules/auth/schema/migrations/202502110001_bootstrapAdmin.js'
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

  return db;
}

/**
 * Clean up test database — drop admin tables and schemas.
 */
export async function cleanupTestDb() {
  const db = await initTestDb();
  await db.none('DROP SCHEMA IF EXISTS admin CASCADE');
  await db.none('DROP SCHEMA IF EXISTS pgschemata CASCADE');
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
