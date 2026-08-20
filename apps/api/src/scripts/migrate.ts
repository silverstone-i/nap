/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Release command that applies migrations to one explicitly named database.
 *
 *   node dist/scripts/migrate.js --target admin [--dry-run]
 *   node dist/scripts/migrate.js --target cell  [--dry-run]
 *
 * Startup never calls this. The target is resolved from the migration-role URL
 * for the current NODE_ENV, so the operator chooses the database by choosing
 * the environment rather than by passing a connection string on a command line.
 */

import type { ApplyAllResult } from 'pg-schemata';

import { migrateAdmin } from '../db/admin/migrateAdmin.js';
import { migrateCell } from '../db/cell/migrateCell.js';
import { currentEnvironment, databaseUrl, loadDotEnv } from '../util/env.js';

type Target = 'admin' | 'cell';

interface Options {
  target: Target;
  dryRun: boolean;
}

/**
 * Parses the command line.
 *
 * @param argv - Arguments after the script name.
 * @returns Parsed options.
 * @throws {Error} On a missing or unrecognized target, or an unknown flag.
 */
function parseOptions(argv: readonly string[]): Options {
  let target: Target | undefined;
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (argument === '--target') {
      const value = argv[index + 1];
      if (value !== 'admin' && value !== 'cell') {
        throw new Error('--target must be admin or cell');
      }
      target = value;
      index += 1;
      continue;
    }

    throw new Error(`Unrecognized argument: ${argument}`);
  }

  if (target === undefined) {
    throw new Error('--target admin|cell is required');
  }

  return { target, dryRun };
}

/**
 * Prints one run's outcome. Connection details are never logged (ARCH-008).
 *
 * @param result - A completed migration run.
 */
function report(result: ApplyAllResult): void {
  const verb = result.dryRun ? 'pending' : 'applied';
  const migrations = result.dryRun ? result.pending : result.applied;

  console.log(
    `schema ${result.schema}: ${migrations.length} ${verb}` +
      (migrations.length === 0
        ? ''
        : `\n  ${migrations.map(m => `${m.module}/${m.id}`).join('\n  ')}`)
  );
}

/**
 * Runs the requested migration.
 */
async function main(): Promise<void> {
  loadDotEnv();

  const options = parseOptions(process.argv.slice(2));
  const connectionString = databaseUrl(
    options.target === 'admin' ? 'ADMIN' : 'CELL',
    'MIGRATION'
  );

  console.log(
    `Migrating ${options.target} database for ${currentEnvironment()}` +
      (options.dryRun ? ' (dry run)' : '')
  );

  const results =
    options.target === 'admin'
      ? [await migrateAdmin({ connectionString, dryRun: options.dryRun })]
      : await migrateCell({ connectionString, dryRun: options.dryRun });

  if (results.length === 0) {
    console.log('No modules are registered for this target yet.');
    return;
  }

  results.forEach(report);
}

await main();
