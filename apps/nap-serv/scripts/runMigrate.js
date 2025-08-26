'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import { migrateTenants } from './migrateTenants.js';
/**
 * This script runs the database migration process.
 * It can be executed directly from the command line.
 *
 * Usage:
 *   node scripts/runMigrate.js [--test] [schema1 schema2 ...]
 *
 * Options:
 *   --test       Run in test mode (does not apply migrations).
 *   schema1 ...  List of schemas to migrate. If none specified, all schemas are migrated.
 */

const args = process.argv.slice(2);
const testFlag = process.env.NODE_ENV === 'test' || args.includes('--test');
const schemaList = args.filter(arg => !arg.startsWith('--'));
console.log('Running migration with the following parameters:');
console.log(`  Test mode: ${testFlag}`);
console.log(`  Schemas: ${schemaList.length > 0 ? schemaList.join(', ') : 'all'}`); 

(async () => {
  try {
    await migrateTenants({ schemaList, testFlag });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
