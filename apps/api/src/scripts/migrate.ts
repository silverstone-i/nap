/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { cellRepositories } from '../db/cell/repositories.js';
import { createCellDatabase } from '../db/cell/index.js';
import { adminRepositories } from '../db/admin/repositories.js';
import { createAdminDatabase } from '../db/admin/index.js';
import { adminModules } from '../db/admin/modules.js';
import { cellModules } from '../db/cell/modules.js';
import { migrateDatabase } from '../db/migrate.js';
import {
  loadLocalEnvironment,
  resolveMigrationConfiguration,
  resolveDatabaseArguments,
} from '../util/env.js';

// Release-only entry point: never imported by runtime code. Emit no driver
// diagnostics because connection failures can contain addresses or credentials.
try {
  const { target, cellId } = resolveDatabaseArguments(process.argv.slice(2));
  loadLocalEnvironment();
  const connection = resolveMigrationConfiguration(target, process.env, cellId);
  await migrateDatabase(
    target,
    connection,
    target === 'admin' ? adminModules : cellModules
  );
  if (target === 'admin') {
    const db = createAdminDatabase(connection, {
      repositories: adminRepositories,
    });
    try {
      await db.db.tenants.grantRuntime('nap_app');
    } finally {
      await db.close();
    }
  }
  if (target === 'cell') {
    const db = createCellDatabase(connection, {
      repositories: cellRepositories,
    });
    try {
      await db.db.employees.grantRuntime('nap_app');
    } finally {
      await db.close();
    }
  }
  console.log(`${target} migrations complete`);
} catch {
  console.error(
    'Database migration failed; check target, configuration, and migration definitions'
  );
  process.exitCode = 1;
}
