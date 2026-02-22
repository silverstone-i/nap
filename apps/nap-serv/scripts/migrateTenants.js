/**
 * @file Migration orchestrator — runs migrations for specified schemas
 * @module nap-serv/scripts/migrateTenants
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { pgp } from '../src/db/db.js';
import migrator from '../src/db/migrations/index.js';
import { getModulesForSchema } from '../src/db/migrations/moduleScopes.js';

async function migrateTenants({ schemaList = [], dryRun = false, testFlag = false, modulesBySchema = {} } = {}) {
  if (!Array.isArray(schemaList) || schemaList.length === 0) {
    console.log('No schemas supplied to migrateTenants; nothing to do.');
    return [];
  }

  const results = [];

  try {
    for (const schemaName of schemaList) {
      const modulesSource = modulesBySchema[schemaName] ?? getModulesForSchema(schemaName) ?? [];
      const moduleSelection = Array.isArray(modulesSource) ? modulesSource : [modulesSource].filter(Boolean);

      console.log(
        `Running migrations for schema "${schemaName}" with modules: ${moduleSelection.length ? moduleSelection.join(', ') : '(none)'}`,
      );

      const outcome = await migrator.run({
        schema: schemaName,
        modules: moduleSelection,
        dryRun: dryRun || testFlag,
        advisoryLock: 424242,
      });

      results.push(outcome);
    }
  } catch (error) {
    console.error('Error during migration:', error.message);
    console.error('Stack trace:', error.stack);
    if (testFlag) throw error;
  } finally {
    if (!testFlag && !dryRun) {
      await pgp.end();
    }
    console.log('Migration routine completed.\n');
  }

  return results;
}

export { migrateTenants };
export default migrateTenants;
