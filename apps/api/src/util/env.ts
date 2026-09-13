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
 * Does: Returns DEV, TEST, or PROD for the selected process environment.
 * Called by: configuration readers before reading operation-specific settings.
 */
export function resolveEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const mode = env.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(mode))
    throw new Error('NODE_ENV must be development, test, or production');
  return mode === 'production' ? 'PROD' : mode === 'test' ? 'TEST' : 'DEV';
}

/**
 * Does: Reports obsolete configuration keys without displaying their values.
 * Called by: environment-specific configuration readers.
 * Why: the approved configuration conversion has no legacy fallback.
 */
function rejectObsolete(env: NodeJS.ProcessEnv) {
  for (const name of Object.keys(env)) {
    if (env[name] === undefined) continue;
    if (
      /^(API_MODE|CELL_CODE|CELL_ID|CELL_API_ORIGINS|ADMIN_RUNTIME_ROLE|CELL_RUNTIME_ROLE)$/.test(
        name
      ) ||
      /^(ADMIN_DATABASE_URL|ADMIN_MIGRATION_URL|CELL_DATABASE_URLS?|CELL_SETUP_RUNTIME_URL|CELL_MIGRATION_URL|SETUP_ADMIN_URL)_(DEV|TEST|PROD)$/.test(
        name
      ) ||
      /^(SESSION_SECRET|AUTH_THROTTLE_SECRET|ROOT_TENANT_CODE|ROOT_COMPANY|ROOT_EMAIL|ROOT_PASSWORD|COOKIE_SECURE|COOKIE_SAMESITE|TRUST_PROXY_HOPS|REDIS_URL|REDIS_CACHE_ENABLED|REDIS_CACHE_NAMESPACE)$/.test(
        name
      )
    )
      throw new Error(`Obsolete configuration: ${name}`);
  }
}

/**
 * Does: Reads one setting from the active environment section.
 * Called by: authentication, bootstrap, Redis, and proxy configuration readers.
 */
export function environmentValue(
  name: string,
  env: NodeJS.ProcessEnv = process.env
) {
  rejectObsolete(env);
  return env[`${name}_${resolveEnvironment(env)}`];
}

/**
 * Does: Returns the trusted proxy count for the selected environment.
 * Called by: server startup before constructing HTTP middleware.
 */
export function resolveTrustProxyHops(
  env: NodeJS.ProcessEnv = process.env
): number {
  const value = environmentValue('TRUST_PROXY_HOPS', env) ?? '0';
  if (!/^\d+$/.test(value) || Number(value) > 16)
    throw new Error('TRUST_PROXY_HOPS must be an integer from 0 to 16');
  return Number(value);
}

/**
 * Does: Parses a credential-free database endpoint and its allowed connection options.
 * Called by: database configuration readers before constructing connection strings.
 */
function endpoint(value: unknown, name: string) {
  try {
    if (
      typeof value !== 'string' ||
      !value ||
      value.trim() !== value ||
      value.includes('://') ||
      /[\s\u0000-\u001f]/.test(value)
    )
      throw new Error();
    const url = new URL(`postgres://${value}`);
    const allowed = new Set([
      'sslmode',
      'sslcert',
      'sslkey',
      'sslrootcert',
      'application_name',
    ]);
    const database = decodeURIComponent(url.pathname.slice(1));
    if (
      !url.hostname ||
      url.username ||
      url.password ||
      value.split('/')[0].includes('@') ||
      url.hash ||
      !database ||
      database.includes('/') ||
      database.includes('\0') ||
      (url.port && (Number(url.port) < 1 || Number(url.port) > 65535)) ||
      [...url.searchParams].some(
        ([key, val]) => !allowed.has(key) || val.includes('\0')
      )
    )
      throw new Error();
    return {
      url,
      target: JSON.stringify([
        url.hostname.toLowerCase(),
        url.port || '5432',
        database,
      ]),
    };
  } catch {
    throw new Error(`Invalid database configuration: ${name}`);
  }
}

/**
 * Does: Reads a production database entry or wraps a local endpoint.
 * Called by: the admin and cell configuration readers.
 */
function databaseEntry(value: unknown, production: boolean, name: string) {
  if (!production)
    return {
      endpoint: value,
      appPassword: undefined,
      adminPassword: undefined,
    };
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`Invalid database configuration: ${name}`);
  if (
    Object.keys(value).some(
      key => !['endpoint', 'appPassword', 'adminPassword'].includes(key)
    )
  )
    throw new Error(`Invalid database configuration: ${name}`);
  return {
    endpoint: 'endpoint' in value ? value.endpoint : undefined,
    appPassword: 'appPassword' in value ? value.appPassword : undefined,
    adminPassword: 'adminPassword' in value ? value.adminPassword : undefined,
  };
}

/**
 * Does: Parses JSON configuration without exposing parser input on failure.
 * Called by: database map and production admin readers.
 */
function json(value: string | undefined, name: string): unknown {
  try {
    return JSON.parse(value ?? '');
  } catch {
    throw new Error(`Invalid database configuration: ${name}`);
  }
}

/**
 * Does: Reads the admin database endpoint and optional production credentials.
 * Called by: runtime and maintenance connection readers.
 */
function adminEntry(env: NodeJS.ProcessEnv) {
  const suffix = resolveEnvironment(env);
  const name = `ADMIN_DATABASE_${suffix}`;
  const entry = databaseEntry(
    suffix === 'PROD' ? json(env[name], name) : env[name],
    suffix === 'PROD',
    name
  );
  return { ...entry, ...endpoint(entry.endpoint, name), name };
}

/**
 * Does: Normalizes a cell UUID supplied in configuration or a command.
 * Called by: cell map readers and maintenance argument parsing.
 */
function cellUuid(value: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  )
    throw new Error('Invalid cell UUID');
  return value.toLowerCase();
}

/**
 * Does: Reads cell entries and rejects duplicate UUIDs or database targets.
 * Called by: runtime and selected-cell maintenance readers.
 * Why: configuration selection does not establish registration or physical identity.
 */
function cellEntries(env: NodeJS.ProcessEnv) {
  const suffix = resolveEnvironment(env);
  const name = `CELL_DATABASES_${suffix}`;
  try {
    const source = env[name] ?? '{}';
    const values = json(source, name);
    const tokens = source.match(/"(?:\\.|[^"\\])*"|[{}\[\]:,]/g) ?? [];
    let depth = 0;
    const keys = new Set<string>();
    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index];
      if (token === '{' || token === '[') depth++;
      else if (token === '}' || token === ']') depth--;
      else if (
        depth === 1 &&
        token?.startsWith('"') &&
        tokens[index + 1] === ':'
      ) {
        const key: unknown = JSON.parse(token);
        if (typeof key !== 'string') throw new Error();
        if (keys.has(key)) throw new Error();
        keys.add(key);
      }
    }
    if (!values || typeof values !== 'object' || Array.isArray(values))
      throw new Error();
    const targets = new Set<string>();
    if (env[`ADMIN_DATABASE_${suffix}`]) targets.add(adminEntry(env).target);
    const cells = new Map<string, ReturnType<typeof adminEntry>>();
    for (const [id, value] of Object.entries(values)) {
      const uuid = cellUuid(id);
      const entry = databaseEntry(value, suffix === 'PROD', name);
      const parsed = endpoint(entry.endpoint, name);
      if (cells.has(uuid) || targets.has(parsed.target)) throw new Error();
      targets.add(parsed.target);
      cells.set(uuid, { ...entry, ...parsed, name });
    }
    return cells;
  } catch {
    throw new Error(`Invalid database configuration: ${name}`);
  }
}

/**
 * Does: Builds a URL for one fixed PostgreSQL role from its endpoint and password.
 * Called by: runtime, setup, and maintenance configuration readers.
 */
function roleUrl(
  entry: ReturnType<typeof adminEntry>,
  role: 'nap_app' | 'nap_admin',
  env: NodeJS.ProcessEnv
) {
  const suffix = resolveEnvironment(env);
  const name = role === 'nap_app' ? 'NAP_APP_PSWD' : 'NAP_ADMIN_PSWD';
  const password =
    suffix === 'PROD'
      ? role === 'nap_app'
        ? entry.appPassword
        : entry.adminPassword
      : env[`${name}_${suffix}`];
  if (
    typeof password !== 'string' ||
    !password ||
    password.includes('\0') ||
    /<[^>]*>|change[ -]?me|replace[ -]?me|placeholder/i.test(password)
  )
    throw new Error(
      `Invalid database configuration: ${suffix === 'PROD' ? entry.name : `${name}_${suffix}`}`
    );
  const url = new URL(entry.url);
  url.username = role;
  url.password = encodeURIComponent(password);
  return url.toString();
}

/**
 * Does: Builds admin and UUID-keyed cell runtime connection strings.
 * Called by: server startup before constructing pools.
 */
export function resolveRuntimeConfiguration(
  env: NodeJS.ProcessEnv = process.env
) {
  rejectObsolete(env);
  return {
    admin: roleUrl(adminEntry(env), 'nap_app', env),
    cells: new Map(
      [...cellEntries(env)].map(([id, entry]) => [
        id,
        roleUrl(entry, 'nap_app', env),
      ])
    ),
  };
}

/**
 * Does: Builds the selected admin or cell maintenance connection string.
 * Called by: explicit migration, bootstrap, reset, and access commands.
 */
export function resolveMigrationConfiguration(
  target: 'admin' | 'cell',
  env: NodeJS.ProcessEnv = process.env,
  cellId?: string
) {
  rejectObsolete(env);
  if (target === 'admin') {
    if (cellId !== undefined)
      throw new Error('Admin target does not accept a cell UUID');
    return roleUrl(adminEntry(env), 'nap_admin', env);
  }
  if (target !== 'cell' || !cellId)
    throw new Error('Cell target requires --cell-id');
  const entry = cellEntries(env).get(cellUuid(cellId));
  if (!entry) throw new Error('Unconfigured maintenance cell');
  return roleUrl(entry, 'nap_admin', env);
}

/**
 * Does: Builds the maintenance connection for the explicitly selected cell.
 * Called by: access maintenance before checking the tenant assignment.
 */
export function resolveCellMaintenanceConfiguration(
  id: string,
  env: NodeJS.ProcessEnv = process.env
) {
  return resolveMigrationConfiguration('cell', env, id);
}

/**
 * Does: Splits a constructed URL into the fields accepted by local psql setup.
 * Called by: local setup configuration before any database connection.
 */
function setupConnection(value: string) {
  const url = new URL(value);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (url.search || !/^[a-z_][a-z0-9_]{0,62}$/.test(database))
    throw new Error('Invalid local setup endpoint');
  return {
    host: url.hostname,
    port: url.port || '5432',
    database,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}

/**
 * Does: Reads the local PostgreSQL administration connection used by setup tooling.
 * Called by: setup configuration and isolated CI fixtures.
 */
export function resolveSetupConnection(
  mode: string | undefined,
  env: NodeJS.ProcessEnv = process.env
) {
  if (mode !== 'test' && mode !== 'development')
    throw new Error('Setup mode must be test or development');
  const selected: NodeJS.ProcessEnv = { ...env, NODE_ENV: mode };
  rejectObsolete(selected);
  const name = `SETUP_DATABASE_${resolveEnvironment(selected)}`;
  const entry = {
    ...endpoint(selected[name], name),
    endpoint: selected[name],
    appPassword: undefined,
    adminPassword: undefined,
    name,
  };
  return setupConnection(roleUrl(entry, 'nap_admin', selected));
}

/**
 * Does: Builds local setup targets for admin and one explicitly selected cell.
 * Called by: the existing setup command before its catalog checks.
 * Why: the approved task changes configuration inputs, not physical provisioning behavior.
 */
export function resolveSetupConfiguration(
  mode: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  cellId?: string
) {
  const setup = resolveSetupConnection(mode, env);
  const selected: NodeJS.ProcessEnv = { ...env, NODE_ENV: mode };
  if (!cellId) throw new Error('Cell setup requires --cell-id');
  const entry = cellEntries(selected).get(cellUuid(cellId));
  if (!entry) throw new Error('Unconfigured setup cell');
  const targets = [adminEntry(selected), entry].map(item => ({
    ...setupConnection(roleUrl(item, 'nap_app', selected)),
    owner: 'nap_admin',
  }));
  if (
    targets.some(
      t =>
        t.host !== setup.host ||
        t.port !== setup.port ||
        t.database === setup.database
    )
  )
    throw new Error('Inconsistent local setup targets');
  return { setup, targets };
}

/**
 * Does: Parses the target, selected cell UUID, and optional reset acknowledgement.
 * Called by: existing migration and reset entry points before database access.
 */
export function resolveDatabaseArguments(
  args: string[],
  reset = false
): { target: 'admin' | 'cell'; cellId: string | undefined } {
  const values = [...args];
  if (reset && values.pop() !== '--confirm')
    throw new Error('Reset requires --confirm');
  const [flag, target, cellFlag, id] = values;
  if (flag !== '--target' || (target !== 'admin' && target !== 'cell'))
    throw new Error('Expected --target admin|cell');
  if (target === 'admin' && values.length === 2)
    return { target, cellId: undefined };
  if (
    target === 'cell' &&
    values.length === 4 &&
    cellFlag === '--cell-id' &&
    id
  )
    return { target, cellId: cellUuid(id) };
  throw new Error('Cell target requires --cell-id; admin accepts no cell UUID');
}

/**
 * Does: Reads the selected Redis connection and cache settings.
 * Called by: server startup and cache-enabled test fixtures.
 */
export function resolveCacheConfiguration(
  env: NodeJS.ProcessEnv = process.env
) {
  const environment = resolveEnvironment(env);
  const enabled = environmentValue('REDIS_CACHE_ENABLED', env)?.trim();
  if (enabled && !['true', 'false'].includes(enabled))
    throw new Error('Invalid REDIS_CACHE_ENABLED');
  const namespace =
    environmentValue('REDIS_CACHE_NAMESPACE', env)?.trim() || 'nap';
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(namespace))
    throw new Error('Invalid REDIS_CACHE_NAMESPACE');
  if (enabled === 'false') return { namespace, url: undefined };
  const url = environmentValue('REDIS_URL', env)?.trim();
  if (!url) {
    if (enabled === 'true' || environment === 'PROD')
      throw new Error('Redis URL is required when caching is enabled');
    return { namespace, url: undefined };
  }
  try {
    if (!['redis:', 'rediss:'].includes(new URL(url).protocol))
      throw new Error();
  } catch {
    throw new Error('Invalid Redis URL');
  }
  return { namespace, url };
}
