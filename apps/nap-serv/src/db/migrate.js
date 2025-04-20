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

function migrate() {
  try {
    Object.keys(repositories).forEach(key => {
      console.log('Creating table for', key);

      const model = db[key];
      model.createTable();
    });

    pgp.end();
    console.log('Database connection closed.');
    console.log('Migration completed.');
  } catch (error) {
    console.error('Error during migration:', error.message);
    console.error('Stack trace:', error.stack);
    pgp.end();
    console.log('Database connection closed.');
    process.exit(1);
  }
}

migrate();
