/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { resetDatabase } from '../db/reset.js';
import {
  loadLocalEnvironment,
  resolveEnvironment,
  resolveMigrationConfiguration,
} from '../util/env.js';

// Explicit operator command; never imported by the API runtime. Require an
// acknowledgement before opening a connection and never print driver errors.
try {
  const args = process.argv.slice(2);
  if (
    args.length !== 3 ||
    args[0] !== '--target' ||
    (args[1] !== 'admin' && args[1] !== 'cell') ||
    args[2] !== '--confirm'
  )
    throw new Error();
  const target = args[1];
  loadLocalEnvironment();
  const environment = resolveEnvironment();
  await resetDatabase(target, resolveMigrationConfiguration(target));
  console.log(
    `${target} ${environment} reset complete; run migrations to rebuild`
  );
} catch {
  console.error(
    'Database reset failed; requires --target admin|cell --confirm. Check NODE_ENV, migration credentials, and active database connections.'
  );
  process.exitCode = 1;
}
