/**
 * @file Countries seeder — populates admin.countries with ISO 3166-1 alpha-2 data
 * @module auth/services/countriesSeeder
 *
 * Called during setupAdmin (after admin-scope migrations).
 * Idempotent — safe to re-run on existing databases.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import logger from '../../../lib/logger.js';
import { COUNTRIES_SEED } from '../schema/migrations/data/countriesSeed.js';

/**
 * Seed the admin.countries table with ISO 3166-1 alpha-2 entries.
 * Idempotent — skips rows that already exist by country_code.
 *
 * @param {object} dbInstance pg-promise database connection or transaction
 */
export async function seedCountries(dbInstance) {
  let inserted = 0;

  for (const { code, name } of COUNTRIES_SEED) {
    const exists = await dbInstance.oneOrNone(
      'SELECT id FROM admin.countries WHERE country_code = $1',
      [code],
    );

    if (!exists) {
      await dbInstance.none(
        'INSERT INTO admin.countries (country_code, name) VALUES ($1, $2)',
        [code, name],
      );
      inserted++;
    }
  }

  logger.info(`Countries seeded: ${inserted} new entries (${COUNTRIES_SEED.length} total)`);
}

export default { seedCountries };
