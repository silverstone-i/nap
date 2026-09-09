/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createAdminDatabase } from './admin/index.js';
import { createCellDatabase } from './cell/index.js';
import { CELL_SCHEMAS } from './modules.js';
import type { DatabaseTarget } from './modules.js';

/**
 * Does: Removes NAP schemas, their data, and migration history from one database.
 * Called by: the explicit reset command and disposable database tests.
 * Why: dropping schemas in one transaction leaves the database and login roles
 * intact and allows migrations to run from the beginning. CASCADE also removes
 * objects that depend on these schemas; callers must use a disposable target.
 */
export async function resetDatabase(
  target: DatabaseTarget,
  connectionString: string
) {
  if (target !== 'admin' && target !== 'cell')
    throw new Error('Reset target must be admin or cell');
  const database =
    target === 'admin'
      ? createAdminDatabase(connectionString)
      : createCellDatabase(connectionString);
  try {
    await database.tx(async tx => {
      await tx.none("SET LOCAL lock_timeout = '5s'");
      const schemas =
        target === 'admin' ? ['admin'] : [...CELL_SCHEMAS].reverse();
      for (const schema of schemas)
        await tx.none('DROP SCHEMA IF EXISTS $1:name CASCADE', [schema]);
    });
  } finally {
    await database.close();
  }
}
