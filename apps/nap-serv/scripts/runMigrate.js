/**
 * @file CLI entry point for database migrations
 * @module nap-serv/scripts/runMigrate
 *
 * Usage:
 *   node scripts/runMigrate.js [--test] [--dry-run] [schema1 schema2 ...]
 *
 * Options:
 *   --test       Run in test mode (does not apply migrations).
 *   --dry-run    Show pending migrations without applying them.
 *   schema1 ...  List of schemas to migrate. If none specified, nothing is migrated.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { migrateTenants } from './migrateTenants.js';

const args = process.argv.slice(2);
const testFlag = process.env.NODE_ENV === 'test' || args.includes('--test');
const dryRun = args.includes('--dry-run') || testFlag;
const schemaList = args.filter((arg) => !arg.startsWith('--'));

console.log('Running migration with the following parameters:');
console.log(`  Test mode: ${testFlag}`);
console.log(`  Dry run: ${dryRun}`);
console.log(`  Schemas: ${schemaList.length > 0 ? schemaList.join(', ') : 'none (supply schema names to migrate)'}`);

(async () => {
  try {
    await migrateTenants({ schemaList, testFlag, dryRun });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
