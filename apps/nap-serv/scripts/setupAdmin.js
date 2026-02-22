/**
 * @file Bootstrap admin schema — creates tables and seeds root tenant + super user
 * @module nap-serv/scripts/setupAdmin
 *
 * Usage: npm -w apps/nap-serv run setupAdmin:dev
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

  // Create pgschemata schema for migration tracking
  await db.none('CREATE SCHEMA IF NOT EXISTS pgschemata');
  logger.info('pgschemata schema ensured.');

  // Run admin-scope migrations
  const { default: moduleRegistry } = await import('../src/db/moduleRegistry.js');

  const adminModules = moduleRegistry.filter((m) => m.scope === 'admin' || m.scope === 'shared');
  const allMigrations = adminModules.flatMap((m) => m.migrations || []);

  if (!allMigrations.length) {
    logger.info('No admin migrations to run.');
    await db.$pool.end();
    return;
  }

  // Ensure migration history table exists
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

  // Check which migrations have already been applied
  const applied = await db.manyOrNone(
    "SELECT id FROM pgschemata.migrations WHERE schema_name = 'admin'",
  );
  const appliedIds = new Set(applied.map((r) => r.id));

  // Instantiate models for the admin schema
  const models = {};
  for (const mod of adminModules) {
    for (const [key, ModelClass] of Object.entries(mod.repositories)) {
      models[key] = new ModelClass(db, DB.pgp, logger);
    }
  }

  // Run pending migrations
  for (const migration of allMigrations) {
    if (appliedIds.has(migration.id)) {
      logger.info(`Migration ${migration.id} already applied, skipping.`);
      continue;
    }

    logger.info(`Running migration: ${migration.id} — ${migration.description}`);

    await migration.up({
      schema: 'admin',
      models,
      db,
      ensureExtensions: async (exts) => {
        for (const ext of exts) {
          await db.none(`CREATE EXTENSION IF NOT EXISTS "${ext}" CASCADE`);
        }
      },
    });

    await db.none(
      `INSERT INTO pgschemata.migrations (id, schema_name, description, checksum)
       VALUES ($1, 'admin', $2, $3)`,
      [migration.id, migration.description, migration.checksum],
    );

    logger.info(`Migration ${migration.id} applied successfully.`);
  }

  logger.info('Admin setup complete.');
  await db.$pool.end();
}

main().catch((err) => {
  console.error('Admin setup failed:', err);
  process.exit(1);
});
