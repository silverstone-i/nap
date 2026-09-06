/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { Database } from 'pg-schemata';
import { createAdminDatabase } from './admin/index.js';
import { createCellDatabase } from './cell/index.js';
import { assertModules, CELL_SCHEMAS } from './modules.js';
import type { DatabaseTarget, NapModuleDescriptor } from './modules.js';

/**
 * Execute one explicit release target. Validation precedes pool creation; each
 * schema uses the library's transaction, lock, and checksum enforcement. Earlier
 * schemas remain committed on failure. Always closes only this release handle.
 * Fixtures may supply descriptors, but the CLI uses static production registries.
 */
export async function migrateDatabase(
  target: DatabaseTarget,
  connectionString: string,
  modules: readonly NapModuleDescriptor[]
): Promise<void> {
  assertModules(target, modules);
  const database: Database =
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
