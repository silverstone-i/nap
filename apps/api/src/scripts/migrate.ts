/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { adminRepositories } from '../db/admin/repositories.js';
import { createAdminDatabase } from '../db/admin/index.js';
import { adminModules } from '../db/admin/modules.js';
import { cellModules } from '../db/cell/modules.js';
import { migrateDatabase } from '../db/migrate.js';
import {
  loadLocalEnvironment,
  resolveMigrationConfiguration,
} from '../util/env.js';

// Release-only entry point: never imported by runtime code. Emit no driver
// diagnostics because connection failures can contain addresses or credentials.
try {
  const args = process.argv.slice(2);
  if (
    args.length !== 2 ||
    args[0] !== '--target' ||
    (args[1] !== 'admin' && args[1] !== 'cell')
  )
    throw new Error();
  const target = args[1];
  loadLocalEnvironment();
  await migrateDatabase(
    target,
    resolveMigrationConfiguration(target),
    target === 'admin' ? adminModules : cellModules
  );
  if (target === 'admin') {
    const db = createAdminDatabase(resolveMigrationConfiguration('admin'), {
      repositories: adminRepositories,
    });
    try {
      await db.db.tenants.grantRuntime(
        process.env.ADMIN_RUNTIME_ROLE ?? 'nap_app'
      );
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
