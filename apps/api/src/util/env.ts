/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

export function loadLocalEnvironment() {
  // Both src/util and dist/util resolve to the workspace root.
  const file = new URL('../../.env', import.meta.url);
  if (!existsSync(file)) return;
  const local = parseEnv(readFileSync(file, 'utf8'));
  for (const [key, value] of Object.entries(local)) process.env[key] ??= value;
}

export function resolvePort(env: NodeJS.ProcessEnv = process.env): number {
  const value = env.PORT ?? '3000';
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
    throw new Error('PORT must be an integer from 1 to 65535');
  }
  return Number(value);
}

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
