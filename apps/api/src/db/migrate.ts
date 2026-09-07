/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createAdminDatabase } from './admin/index.js';
import { createCellDatabase } from './cell/index.js';
import { assertModules, CELL_SCHEMAS } from './modules.js';
import type { DatabaseTarget, NapModuleDescriptor } from './modules.js';

/**
 * Does: Applies every pending migration for one database, schema by schema,
 * using a pool opened and closed inside this call.
 * Called by: the migrate script for a release, and by database test fixtures
 * with their own module lists.
 * Why: the module list is validated before any connection is opened, so a
 * bad registry fails without touching the database. Each schema migrates
 * inside the library's own transaction with locking and checksum checks, so
 * a failure in one schema leaves earlier schemas committed and later ones
 * untouched. The pool is always closed, even on failure.
 */
export async function migrateDatabase(
  target: DatabaseTarget,
  connectionString: string,
  modules: readonly NapModuleDescriptor[]
): Promise<void> {
  assertModules(target, modules);
  const database =
    target === 'admin'
      ? createAdminDatabase(connectionString)
      : createCellDatabase(connectionString);
  try {
    await database.connect();
    const schemas = target === 'admin' ? ['admin'] : CELL_SCHEMAS;
    for (const schema of schemas) {
      await database.migrate({
        schema,
        modules: modules.filter(m => m.schema === schema),
      });
    }
  } finally {
    await database.close();
  }
}
