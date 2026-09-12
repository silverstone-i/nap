/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import {
  readFile,
  writeFile,
  rename,
  mkdir,
  rm,
  chmod,
} from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Does: Marks fixed operator diagnostics as safe to print. Used by: the CLI error boundary. */
export class ProvisioningError extends Error {}

/** Does: Parses the explicit maintenance command and selected environment. Called by: the database CLI before opening files or connections. */
export function argumentsFor(args) {
  const [operation, target, ...rest] = args;
  if (
    !['setup', 'migrate', 'bootstrap', 'seed', 'activate'].includes(
      operation
    ) ||
    !['admin', 'cell'].includes(target)
  )
    throw new ProvisioningError('Invalid database command');
  if (
    (['bootstrap'].includes(operation) && target !== 'admin') ||
    (['seed', 'activate'].includes(operation) && target !== 'cell')
  )
    throw new ProvisioningError('Invalid database target');
  const values = {};
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i];
    if (
      key === '--reset-root-password' &&
      operation === 'bootstrap' &&
      target === 'admin' &&
      !values[key]
    ) {
      values[key] = true;
      i--;
      continue;
    }
    if (
      !['--env', '--cell-name', '--cell-id'].includes(key) ||
      values[key] ||
      !rest[i + 1]
    )
      throw new ProvisioningError('Invalid database arguments');
    values[key] = rest[i + 1];
  }
  const environment = values['--env'];
  if (!['dev', 'test', 'prod'].includes(environment))
    throw new ProvisioningError('Required --env dev|test|prod');
  const name = values['--cell-name'];
  const id = values['--cell-id'];
  if (target === 'admin' && (name || id))
    throw new ProvisioningError('Admin accepts no cell selector');
  if (target === 'cell' && operation === 'setup') {
    if (
      id ||
      !name ||
      !/^[a-z0-9_]+$/.test(name) ||
      `nap_${environment}_cell_${name}`.length > 63
    )
      throw new ProvisioningError('Required valid --cell-name');
  } else if (
    target === 'cell' &&
    (name ||
      !id ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id
      ))
  )
    throw new ProvisioningError('Required --cell-id UUID');
  return {
    operation,
    resetRoot: values['--reset-root-password'] === true,
    target,
    environment,
    name,
    id: id?.toLowerCase(),
    database:
      target === 'admin'
        ? `nap_${environment}_admin`
        : name
          ? `nap_${environment}_cell_${name}`
          : undefined,
  };
}
/** Does: Reads a file or returns its initial empty contents. Called by: local configuration and state readers. */
async function readOptional(file) {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
}
/** Does: Atomically replaces a private file beside its temporary copy. Called by: credential and configuration persistence. */
export async function privateWrite(file, content) {
  await mkdir(dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, content, { mode: 0o600, flag: 'wx' });
    await rename(temp, file);
    await chmod(file, 0o600);
  } finally {
    await rm(temp, { force: true });
  }
}
/** Does: Opens private resumable setup state under a single-process lock. Called by: the CLI; close must run in finally. */
export async function configuration(command, inherited = process.env) {
  const envFile = resolve(
    inherited.NAP_ENV_FILE ||
      fileURLToPath(new URL('../../apps/api/.env', import.meta.url))
  );
  const env = {
    ...parseEnv(await readOptional(envFile)),
    ...inherited,
    NODE_ENV: { dev: 'development', test: 'test', prod: 'production' }[
      command.environment
    ],
  };
  const stateFile = resolve(
    env.NAP_PROVISION_STATE ||
      fileURLToPath(
        new URL(
          `../../apps/api/.env.provisioning.${command.environment}.json`,
          import.meta.url
        )
      )
  );
  await mkdir(dirname(stateFile), { recursive: true });
  const lock = `${stateFile}.lock`;
  try {
    await mkdir(lock, { mode: 0o700 });
  } catch {
    throw new ProvisioningError(
      'Provisioning state is locked; verify no command is running before removing a stale lock'
    );
  }
  try {
    const raw = await readOptional(stateFile);
    const state = raw
      ? JSON.parse(raw)
      : { environment: command.environment, databases: {} };
    if (state.environment !== command.environment || !state.databases)
      throw new ProvisioningError('Wrong provisioning state environment');
    return {
      env,
      envFile,
      state,
      stateFile,
      save: () =>
        privateWrite(stateFile, JSON.stringify(state, null, 2) + '\n'),
      close: () => rm(lock, { recursive: true }),
    };
  } catch (error) {
    await rm(lock, { recursive: true });
    throw error;
  }
}
/** Does: Supplies independent role passwords without replacing existing values. Called by: setup before any resource is created. */
export function passwords(context, entry) {
  const suffix = context.state.environment.toUpperCase();
  const supplied =
    suffix === 'PROD'
      ? entry.id
        ? JSON.parse(context.env.CELL_DATABASES_PROD || '{}')[entry.id]
        : JSON.parse(context.env.ADMIN_DATABASE_PROD || 'null')
      : null;
  for (const [field, key] of [
    ['appPassword', 'NAP_APP_PSWD'],
    ['adminPassword', 'NAP_ADMIN_PSWD'],
  ]) {
    const existing =
      suffix === 'PROD'
        ? supplied?.[field] || entry[field]
        : context.env[`${key}_${suffix}`] || context.state[key];
    if (existing && entry[field] && existing !== entry[field])
      throw new ProvisioningError(
        'Configured password differs from saved setup state'
      );
    if (
      existing &&
      (existing.includes('\0') ||
        /<[^>]*>|change[ -]?me|placeholder/i.test(existing))
    )
      throw new ProvisioningError('Invalid configured database password');
    entry[field] ||=
      existing ||
      execFileSync('openssl', ['rand', '-hex', '32'], {
        encoding: 'utf8',
      }).trim();
    if (suffix !== 'PROD') context.state[key] = entry[field];
  }
}
/** Does: Builds an encoded PostgreSQL URI with a fixed role. Called by: setup and maintenance commands. */
export function roleUrl(endpoint, role, password) {
  const url = new URL(`postgres://${endpoint}`);
  if (
    url.username ||
    url.password ||
    url.hash ||
    !url.hostname ||
    url.pathname === '/'
  )
    throw new ProvisioningError('Invalid endpoint');
  for (const key of url.searchParams.keys())
    if (
      ![
        'sslmode',
        'sslcert',
        'sslkey',
        'sslrootcert',
        'application_name',
      ].includes(key)
    )
      throw new ProvisioningError('Unsupported database endpoint option');
  url.username = role;
  url.password = encodeURIComponent(password);
  return url.href;
}
/** Does: Publishes selected configuration keys without altering unrelated dotenv entries. Called by: local setup and activation. */
export async function publishLocal(context, updates) {
  const text = await readOptional(context.envFile);
  const parsed = parseEnv(text);
  for (const [key, value] of Object.entries(updates)) {
    if (key.startsWith('CELL_DATABASES_')) {
      const current = JSON.parse(parsed[key] || '{}');
      const additions = JSON.parse(value);
      if (!current || Array.isArray(current) || typeof current !== 'object')
        throw new ProvisioningError('Invalid current cell map');
      for (const [id, endpoint] of Object.entries(additions)) {
        if (current[id] && current[id] !== endpoint)
          throw new ProvisioningError('Existing cell endpoint differs');
        current[id] = endpoint;
      }
      updates[key] = JSON.stringify(current);
    }
  }

  for (const [key, value] of Object.entries(updates)) {
    if (process.env[key] !== undefined && process.env[key] !== value)
      throw new ProvisioningError(
        'Inherited configuration conflicts with published configuration'
      );
    if (parsed[key] !== undefined && typeof parsed[key] !== 'string')
      throw new ProvisioningError('Invalid existing configuration');
  }
  updates = Object.fromEntries(
    Object.entries(updates).filter(
      ([key, value]) => parsed[key] !== value && process.env[key] !== value
    )
  );
  if (
    Object.values(updates).some(
      value =>
        value.includes("'") || value.includes('\n') || value.includes('\r')
    )
  )
    throw new ProvisioningError(
      'Configuration value requires manual dotenv quoting'
    );
  const keys = new Set(Object.keys(updates));
  const lines = text
    .split('\n')
    .filter(
      line => !keys.has(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=/.exec(line)?.[1])
    );
  await privateWrite(
    context.envFile,
    lines.join('\n').trimEnd() +
      '\n' +
      Object.entries(updates)
        .map(([key, value]) => `${key}='${value.replaceAll("'", "\\'")}'`)
        .join('\n') +
      '\n'
  );
}
