'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import { db, pgp } from './db.js';
import repositories from './repositories.js';

async function migrate() {
  try {
    for (const key of Object.keys(repositories)) {
      console.log('Creating table for', key);

      const model = db[key];
      await model.createTable();
      console.log('Created table:', key);
    }
  } catch (error) {
    console.error('Error during migration:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    pgp.end();
    console.log('Database connection closed.');
    console.log('Migration completed.');
  }
}

await migrate().catch(err => {
  console.error(err);
  process.exit(1);
});
