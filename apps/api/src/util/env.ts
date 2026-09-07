/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { statSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

/**
 * Does: Loads the API workspace's .env file into process.env, if the file
 * exists, without overwriting values already set.
 * Called by: the server entry point, the migrate script, and the database
 * setup script, before they read any configuration.
 * Why: values already in the environment win, even empty ones, so a local
 * .env can never override CI or deployment settings. A missing file is
 * normal for environments configured externally; any other error reading
 * the file propagates.
 */
export function loadLocalEnvironment() {
  // Resolve from this module so source and compiled entry points use the same
  // API .env regardless of the command's working directory.
  const file = new URL('../../.env', import.meta.url);
  // Preserve access errors: existsSync hides them, and Node's loader can report
  // ENOENT for an inaccessible path. Only a genuinely missing file is optional.
  if (!statSync(file, { throwIfNoEntry: false })) return;
  loadEnvFile(file);
}

/**
 * Does: Returns the port the API should listen on, from PORT, defaulting
 * to 3000.
 * Called by: the server entry point at startup, and unit tests.
 * Why: port 0 is rejected because it would let the OS pick a port, and
 * startup needs a known one.
 * @throws If PORT is set and is not a whole number from 1 to 65535.
 */
export function resolvePort(env: NodeJS.ProcessEnv = process.env): number {
  const value = env.PORT ?? '3000';
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
    throw new Error('PORT must be an integer from 1 to 65535');
  }
  return Number(value);
}

/**
 * Does: Reads one environment variable holding a PostgreSQL URL and splits
 * it into host, port, user, password, and database name.
 * Called by: resolveSetupConfiguration, once per URL it needs.
 * Why: the setup script passes these fields to psql separately and compares
 * them across URLs, so it needs the parts, not the string. Query options and
 * fragments are rejected rather than dropped, because this conversion cannot
 * carry them to psql and silently losing part of a URL is worse than
 * failing. User and database names must be simple lowercase identifiers.
 * The returned password is a secret; never log it.
 * @throws With only the variable name when the URL is missing or invalid,
 * so a password in a bad URL never appears in an error message.
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
 * Does: Reads and cross-checks the database URLs the development or test
 * database setup script needs, and returns the setup connection plus the
 * admin and cell targets with their owning role.
 * Called by: the setup script in scripts/, the test PostgreSQL fixture, and
 * unit tests. Not used by API startup.
 * Why: setup creates both databases through one connection, so every URL
 * must point at the setup server and the migration user must be the setup
 * user. The runtime and migration URLs for a target must name the same
 * database but different users, the runtime user must match the configured
 * runtime role, and the three database names must differ. A runtime role
 * shared by both targets must have one password because setup creates the
 * role once. All of this is checked before any database is touched. This
 * function does not load .env or connect to PostgreSQL. See ARCH-019 and
 * the specification's database composition roots.
 * @param mode "test" or "development"; selects the _TEST or _DEV variables.
 * @throws On an unknown mode, a missing or invalid URL, or inconsistent
 * settings. Error text is safe to show; the returned values are not.
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

/**
 * Does: Returns DEV, TEST, or PROD from NODE_ENV, defaulting to DEV when
 * NODE_ENV is unset.
 * Called by: the runtime and migration configuration readers, to pick which
 * database URL variables to read.
 * Why: this runs before any credential is read, so a bad NODE_ENV fails with
 * a message that cannot contain a secret.
 * @throws If NODE_ENV is set to anything other than development, test, or
 * production.
 */
export function resolveEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const mode = env.NODE_ENV ?? 'development';
  if (mode !== 'development' && mode !== 'test' && mode !== 'production')
    throw new Error('NODE_ENV must be development, test, or production');
  return { development: 'DEV', test: 'TEST', production: 'PROD' }[mode];
}

/**
 * Does: Reads one environment variable holding a PostgreSQL URL, checks it,
 * and returns the string unchanged plus a normalised host, port, and
 * database key.
 * Called by: resolveRuntimeConfiguration and resolveMigrationConfiguration.
 * Why: the string is returned as-is so TLS and application-name options
 * survive into the driver. Only those options are allowed; anything that
 * could redirect the connection or change the session role is rejected.
 * The key lets callers detect two URLs pointing at the same database.
 * @throws With only the variable name, so neither the URL nor the parser's
 * message can leak a credential.
 */
function databaseUrl(env: NodeJS.ProcessEnv, name: string) {
  try {
    const value = env[name];
    if (!value) throw new Error();
    const parsed = new URL(value);
    const allowed = new Set([
      'sslmode',
      'sslcert',
      'sslkey',
      'sslrootcert',
      'application_name',
    ]);
    if (
      !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
      !parsed.hostname ||
      !parsed.username ||
      parsed.hash ||
      !decodeURIComponent(parsed.pathname.slice(1)) ||
      [...parsed.searchParams.keys()].some(key => !allowed.has(key))
    )
      throw new Error();
    for (const field of [parsed.username, parsed.password, parsed.pathname]) {
      if (decodeURIComponent(field).includes('\0')) throw new Error();
    }
    return {
      connectionString: value,
      target: JSON.stringify([
        parsed.hostname.toLowerCase(),
        parsed.port || '5432',
        decodeURIComponent(parsed.pathname.slice(1)),
      ]),
    };
  } catch {
    throw new Error(`Invalid database configuration: ${name}`);
  }
}

/**
 * Does: Returns the admin and cell database URLs for the current NODE_ENV.
 * Called by: the server entry point at startup.
 * Why: only the runtime URLs are read here, never the migration ones. The
 * two URLs must not resolve to the same host, port, and database, or startup
 * fails; two hostnames that are aliases of one server are not detected and
 * remain the deployment's responsibility. The returned strings contain
 * passwords; never log them.
 * @throws If NODE_ENV or either URL is invalid, or both URLs match.
 */
export function resolveRuntimeConfiguration(
  env: NodeJS.ProcessEnv = process.env
) {
  const suffix = resolveEnvironment(env);
  const admin = databaseUrl(env, `ADMIN_DATABASE_URL_${suffix}`);
  const cell = databaseUrl(env, `CELL_DATABASE_URL_${suffix}`);
  if (admin.target === cell.target)
    throw new Error('Admin and cell database targets must be distinct');
  return { admin: admin.connectionString, cell: cell.connectionString };
}

/**
 * Does: Returns the migration database URL for one target, admin or cell,
 * for the current NODE_ENV.
 * Called by: the migrate script.
 * Why: only the requested target's URL is read, so a release for one
 * database never needs, or validates, the other's credential. The returned
 * string contains a password; never log it.
 * @throws If the target is not admin or cell, or NODE_ENV or the URL is
 * invalid.
 */
export function resolveMigrationConfiguration(
  target: 'admin' | 'cell',
  env: NodeJS.ProcessEnv = process.env
) {
  if (target !== 'admin' && target !== 'cell')
    throw new Error('Migration target must be admin or cell');
  const suffix = resolveEnvironment(env);
  return databaseUrl(env, `${target.toUpperCase()}_MIGRATION_URL_${suffix}`)
    .connectionString;
}
