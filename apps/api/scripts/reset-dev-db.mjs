/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Feeds reset-dev-db.sql to psql. A wrapper exists because the connection
 * string lives in .env, which only Node reads (via --env-file-if-exists);
 * psql would otherwise need it exported by hand.
 *
 * Development only, and deliberately so: it always reads DATABASE_URL_DEV,
 * and the SQL refuses to run against any database but nap_dev.
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const connectionString = process.env.DATABASE_URL_DEV?.trim();

if (!connectionString) {
  console.error(
    'DATABASE_URL_DEV is not set — copy .env.example to .env and fill it in.'
  );
  process.exit(1);
}

const sqlPath = fileURLToPath(new URL('./reset-dev-db.sql', import.meta.url));

const { status, error } = spawnSync(
  'psql',
  [connectionString, '-v', 'ON_ERROR_STOP=1', '-f', sqlPath],
  { stdio: 'inherit' }
);

if (error) {
  console.error(`could not run psql: ${error.message}`);
  process.exit(1);
}

process.exit(status ?? 1);
