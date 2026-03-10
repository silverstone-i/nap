/**
 * @file CLI script to reseed admin.countries with ISO 3166-1 data
 * @module nap-serv/scripts/db/reseedCountries
 *
 * Usage:
 *   cross-env NODE_ENV=development node scripts/db/reseedCountries.js
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
  const { default: repositories } = await import('../../apps/nap-serv/src/db/repositories.js');
  const { default: logger } = await import('../../apps/nap-serv/src/lib/logger.js');
  const { getDatabaseUrl } = await import('../../apps/nap-serv/src/lib/envValidator.js');

  const DATABASE_URL = getDatabaseUrl();

  if (!DB.db) {
    DB.init(DATABASE_URL, repositories, logger);
  }

  const { seedCountries } = await import('../../apps/nap-serv/src/system/auth/services/countriesSeeder.js');
  await seedCountries(DB.db);

  logger.info('Countries reseed complete.');
  await DB.db.$pool.end();
}

main().catch((err) => {
  console.error('Countries reseed failed:', err);
  process.exit(1);
});
