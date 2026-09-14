/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { readFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import {
  configuration,
  privateWrite,
  ProvisioningError,
  roleUrl,
} from './provision/config.mjs';
import { using } from './provision/postgres.mjs';

/**
 * Does: Deletes development databases and clears their local configuration.
 * Called by: the explicit cleanup CLI and disposable database tests.
 * Why: a fresh installation requires both database removal and removal of saved provisioning intent.
 */
export async function cleanDev(args, inherited = process.env) {
  if (args.length !== 1 || args[0] !== '--confirm')
    throw new ProvisioningError('Required db:clean:dev -- --confirm');
  const context = await configuration({ environment: 'dev' }, inherited);
  try {
    const text = await readFile(context.envFile, 'utf8');
    const pattern =
      /^([ \t]*(?:export[ \t]+)?CELL_DATABASES_DEV[ \t]*=[ \t]*)(?:'[^'\r\n]*'|"(?:\\.|[^"\\\r\n])*"|[^#\r\n]*?)([ \t]*(?:#[^\r\n]*)?)$/gm;
    const matches = [...text.matchAll(pattern)];
    if (
      matches.length !== 1 ||
      parseEnv(matches[0][0]).CELL_DATABASES_DEV !==
        parseEnv(text).CELL_DATABASES_DEV
    )
      throw new ProvisioningError(
        'Required one single-line CELL_DATABASES_DEV entry'
      );
    const output = text.replace(pattern, "$1'{}'$2");
    if (
      inherited.CELL_DATABASES_DEV !== undefined &&
      inherited.CELL_DATABASES_DEV !== '{}'
    )
      throw new ProvisioningError(
        'Unset inherited CELL_DATABASES_DEV before cleanup'
      );
    const url = roleUrl(
      context.env.SETUP_DATABASE_DEV,
      'nap_admin',
      context.env.NAP_ADMIN_PSWD_DEV
    );
    if (
      new URL(url).pathname !== '/postgres' ||
      !context.env.NAP_ADMIN_PSWD_DEV
    )
      throw new ProvisioningError(
        'DEV cleanup requires the postgres maintenance database and configured password'
      );
    const removed = await using(url, async db => {
      const databases = await db.any(
        "SELECT datname, pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = 'nap_dev_admin' OR datname ~ '^nap_dev_cell_[a-z0-9_]+$' ORDER BY datname"
      );
      if (databases.some(row => row.owner !== 'nap_admin'))
        throw new ProvisioningError(
          'DEV database ownership differs from nap_admin'
        );
      for (const row of databases)
        await db.none('DROP DATABASE IF EXISTS $1:name WITH (FORCE)', [
          row.datname,
        ]);
      return databases.map(row => row.datname);
    });
    // Keep recovery metadata until all database drops and configuration writes succeed.
    await privateWrite(context.envFile, output);
    await rm(context.stateFile, { force: true });
    return { removed, cellMap: 'cleared', provisioningState: 'removed' };
  } finally {
    await context.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    console.log(JSON.stringify(await cleanDev(process.argv.slice(2))));
  } catch (error) {
    console.error(
      error instanceof ProvisioningError
        ? error.message
        : 'DEV cleanup failed. Stop the API and verify DEV configuration and database ownership before retrying.'
    );
    process.exitCode = 1;
  }
}
