/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

/**
 * Load the API workspace's optional .env for API startup and database setup.
 * Uses Node's loader to fill missing process.env values; returns nothing.
 * Inherited values (including empty strings) win, so local settings cannot
 * override CI or deployment configuration. Reads the file synchronously during
 * initialization. A missing file is allowed for environments configured externally;
 * errors from loading an existing file propagate to the caller.
 */
export function loadLocalEnvironment() {
  // Resolve from this module so source and compiled entry points use the same
  // API .env regardless of the command's working directory.
  const file = new URL('../../.env', import.meta.url);
  if (!existsSync(file)) return;
  loadEnvFile(file);
}

/**
 * Return the numeric listening port for API startup, using 3000 when PORT is absent.
 * Reads the supplied environment (process.env by default) without changing it.
 * Reject port 0 so startup uses a known port rather than an OS-assigned one.
 * @throws If PORT is not a decimal integer in 1–65535.
 */
export function resolvePort(env: NodeJS.ProcessEnv = process.env): number {
  const value = env.PORT ?? '3000';
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
    throw new Error('PORT must be an integer from 1 to 65535');
  }
  return Number(value);
}

/**
 * Read one named environment URL for resolveSetupConfiguration and return its
 * host, port, user, password, and database. Does not connect to PostgreSQL.
 * Setup needs separate fields to pass connection settings to psql and compare
 * database targets and roles before provisioning.
 *
 * Only explicit credentials and simple database/role identifiers are supported.
 * Query options and fragments are rejected because this conversion does not carry
 * them into psql; accepting them would silently discard part of the supplied URL.
 * @throws If the URL is missing or unsupported. Errors identify only the variable
 * to avoid leaking passwords through URLs or parser diagnostics. Returned fields
 * contain credentials and must never be logged.
 */
function connection(env: NodeJS.ProcessEnv, name: string) {
  try {
    const url = new URL(env[name] ?? '');
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.search ||
      url.hash
    )
      throw new Error();
    const host = url.hostname;
    const port = url.port || '5432';
    // WHATWG URL credential getters retain percent encoding. Decode exactly once
    // so a password containing a literal percent sign reaches PostgreSQL intact.
    const user = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);
    const database = decodeURIComponent(url.pathname.slice(1));
    if (
      !host ||
      !password ||
      password.includes('\0') ||
      !/^[a-z_][a-z0-9_]{0,62}$/.test(user) ||
      !/^[a-z_][a-z0-9_]{0,62}$/.test(database)
    )
      throw new Error();
    return { host, port, user, password, database };
  } catch {
    throw new Error(`Invalid database configuration: ${name}`);
  }
}

/**
 * Read and validate configuration for the development/test database setup script,
 * not normal API startup. Selects DEV or TEST settings from the supplied environment
 * (process.env by default); does not load .env or connect to PostgreSQL.
 *
 * Returns the setup connection and admin/cell runtime targets with their owners.
 * Check target and role consistency before provisioning so contradictory settings
 * fail before any database changes. Targets must share the setup server and owner
 * because setup creates both databases through that connection. Database names
 * must differ to keep setup, admin, and cell targets separate. A shared runtime
 * role must have one password because setup creates that role only once.
 *
 * @throws On an unsupported mode, missing/invalid URL, or inconsistent target or
 * role configuration. Returned connection fields are sensitive; errors are safe
 * to report. See the specification's database composition roots and ARCH-019.
 */
export function resolveSetupConfiguration(
  mode: string | undefined,
  env: NodeJS.ProcessEnv = process.env
) {
  if (mode !== 'test' && mode !== 'development')
    throw new Error('Setup mode must be test or development');
  const suffix = mode === 'test' ? 'TEST' : 'DEV';
  const setup = connection(env, `SETUP_ADMIN_URL_${suffix}`);
  const targets = ['ADMIN', 'CELL'].map(target => {
    const runtime = connection(env, `${target}_DATABASE_URL_${suffix}`);
    const migration = connection(env, `${target}_MIGRATION_URL_${suffix}`);
    if (
      runtime.database !== migration.database ||
      runtime.user === migration.user ||
      runtime.user !== env[`${target}_RUNTIME_ROLE`] ||
      [runtime, migration].some(
        c => c.host !== setup.host || c.port !== setup.port
      ) ||
      migration.user !== setup.user ||
      migration.password !== setup.password
    ) {
      throw new Error('Inconsistent database targets or role configuration');
    }
    return { ...runtime, owner: migration.user };
  });
  if (
    targets[0].database === targets[1].database ||
    targets.some(t => t.database === setup.database)
  ) {
    throw new Error('Setup, admin, and cell database targets must be distinct');
  }
  const passwords = new Map<string, string>();
  for (const target of targets) {
    if (
      passwords.has(target.user) &&
      passwords.get(target.user) !== target.password
    )
      throw new Error('Inconsistent runtime role credentials');
    passwords.set(target.user, target.password);
  }
  return { setup, targets };
}
