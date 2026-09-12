/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { resetDatabase } from '../db/reset.js';
import {
  loadLocalEnvironment,
  resolveEnvironment,
  resolveMigrationConfiguration,
  resolveDatabaseArguments,
} from '../util/env.js';

// Explicit operator command; never imported by the API runtime. Require an
// acknowledgement before opening a connection and never print driver errors.
try {
  const { target, cellId } = resolveDatabaseArguments(
    process.argv.slice(2),
    true
  );
  loadLocalEnvironment();
  const environment = resolveEnvironment();
  await resetDatabase(
    target,
    resolveMigrationConfiguration(target, process.env, cellId)
  );
  console.log(
    `${target} ${environment} reset complete; run migrations to rebuild`
  );
} catch {
  console.error(
    'Database reset failed; requires --target admin|cell [--cell-id UUID] --confirm. Check NODE_ENV, migration credentials, and active database connections.'
  );
  process.exitCode = 1;
}
