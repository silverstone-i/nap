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
      fileURLToPath(new URL('../../../.env', import.meta.url))
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
          `../../../.env.provisioning.${command.environment}.json`,
          import.meta.url
        )
      )
  );
  await mkdir(dirname(stateFile), { recursive: true });
  const lock = `${stateFile}.lock`;
  try {
    await mkdir(lock, { mode: 0o700 });
  } catch {
    let stale = false;
    try {
      const pid = Number(await readFile(`${lock}/pid`, 'utf8'));
      if (Number.isInteger(pid) && pid > 0) {
        try {
          process.kill(pid, 0);
        } catch (error) {
          stale = error.code === 'ESRCH';
        }
      }
    } catch {
      /* Locks without ownership metadata require operator inspection. */
    }
    if (!stale)
      throw new ProvisioningError(
        'Provisioning state is locked; verify no command is running before removing a stale lock'
      );
    await rm(lock, { recursive: true });
    await mkdir(lock, { mode: 0o700 });
  }
  await writeFile(`${lock}/pid`, String(process.pid), { mode: 0o600 });
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
      close: () => rm(lock, { recursive: true, force: true }),
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
/**
 * Does: Updates configuration values in place and appends only missing variables.
 * Called by: local setup and activation when publishing database connections.
 * Why: the environment contract preserves the template's variable order and comments.
 */
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
    if (
      !(context.api && key.startsWith('CELL_DATABASES_')) &&
      process.env[key] !== undefined &&
      process.env[key] !== value
    )
      throw new ProvisioningError(
        'Inherited configuration conflicts with published configuration'
      );
    if (parsed[key] !== undefined && typeof parsed[key] !== 'string')
      throw new ProvisioningError('Invalid existing configuration');
  }
  updates = Object.fromEntries(
    Object.entries(updates).filter(
      ([key, value]) =>
        parsed[key] !== value && (context.api || process.env[key] !== value)
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
  const pending = new Map(Object.entries(updates));
  const lines = text.split('\n').map(line => {
    const match = /^(\s*(?:export\s+)?([A-Z0-9_]+)\s*=).*$/.exec(line);
    if (!match || !pending.has(match[2])) return line;
    const value = pending.get(match[2]);
    pending.delete(match[2]);
    return `${match[1]}'${value}'`;
  });
  let output = lines.join('\n');
  for (const [key, value] of pending) {
    if (output && !output.endsWith('\n')) output += '\n';
    output += `${key}='${value}'\n`;
  }
  await privateWrite(context.envFile, output);
}

/**
 * Does: Opens durable production state from Render secrets without local files.
 * Called by: production cell operations before resource or role changes.
 */
export async function remoteConfiguration(command, env, call) {
  const path = `/services/${env.RENDER_API_SERVICE_ID}/env-vars/NAP_PROVISION_STATE_PROD`;
  const saved = await call(path);
  const legacy = !saved?.value
    ? await readOptional(
        env.NAP_PROVISION_STATE ||
          fileURLToPath(
            new URL('../../../.env.provisioning.prod.json', import.meta.url)
          )
      )
    : '';
  const state = saved?.value
    ? JSON.parse(saved.value)
    : legacy
      ? JSON.parse(legacy)
      : { environment: command.environment, databases: {} };
  if (state.environment !== command.environment || !state.databases)
    throw new ProvisioningError('Wrong provisioning state environment');
  return {
    env,
    envFile: '',
    state,
    stateFile: '',
    save: async () => {
      await call(path, 'PUT', { value: JSON.stringify(state) });
    },
    close: async () => {},
  };
}
