/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createAdminDatabase } from '../db/admin/index.js';
import { adminRepositories } from '../db/admin/repositories.js';
import {
  bootstrapConfiguration,
  bootstrapRoot,
} from '../services/bootstrap.js';
import {
  loadLocalEnvironment,
  resolveMigrationConfiguration,
} from '../util/env.js';

// Operator-only entry point. Diagnostics deliberately omit configured values.
try {
  loadLocalEnvironment();
  const configuration = bootstrapConfiguration(
    process.env,
    process.argv.slice(2)
  );
  const db = createAdminDatabase(resolveMigrationConfiguration('admin'), {
    repositories: adminRepositories,
  });
  try {
    await bootstrapRoot(db, configuration);
  } finally {
    await db.close();
  }
  console.log('Root bootstrap complete');
} catch {
  console.error(
    'Root bootstrap failed; check configuration, arguments, and admin migrations'
  );
  process.exitCode = 1;
}
