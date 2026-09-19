/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { readFileSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { requireCondition, MaintenanceError } from './errors.js';
export function argumentsFor(args) {
  requireCondition(
    args.length === 2 &&
      args[0] === '--env' &&
      ['dev', 'test', 'prod'].includes(args[1]),
    'INVALID_ARGUMENTS'
  );
  return args[1];
}
export function environment(env = process.env) {
  const file =
    env.NAP_ENV_FILE ||
    fileURLToPath(new URL('../../../.env', import.meta.url));
  let local = {};
  try {
    if (existsSync(file)) local = parseEnv(readFileSync(file, 'utf8'));
    else requireCondition(!env.NAP_ENV_FILE, 'MISSING_ENV_FILE');
  } catch {
    throw new MaintenanceError('INVALID_ENV_FILE');
  }
  return { ...local, ...env };
}
export function endpoint(value, setting) {
  try {
    requireCondition(
      typeof value === 'string' && !value.includes('://'),
      'INVALID_CONFIGURATION',
      setting
    );
    const url = new URL(`postgresql://${value}`);
    requireCondition(
      !url.username &&
        !url.password &&
        /^[a-z][a-z0-9_]{0,62}$/.test(url.pathname.slice(1)) &&
        !url.hash,
      'INVALID_CONFIGURATION',
      setting
    );
    for (const key of url.searchParams.keys())
      requireCondition(
        [
          'sslmode',
          'sslcert',
          'sslkey',
          'sslrootcert',
          'application_name',
        ].includes(key),
        'INVALID_CONFIGURATION',
        setting
      );
    return url;
  } catch {
    throw new MaintenanceError('INVALID_CONFIGURATION', setting);
  }
}
export function roleUrl(value, role, password) {
  const url = endpoint(value, 'database endpoint');
  url.username = role;
  url.password = password;
  return url.href;
}
export function secret(value, setting) {
  requireCondition(
    typeof value === 'string' && value.length > 0 && !/[<>]/.test(value),
    'INVALID_CONFIGURATION',
    setting
  );
  return value;
}
export function localConfiguration(selected, env) {
  const suffix = selected.toUpperCase();
  const adminPassword = secret(
    env[`NAP_ADMIN_PSWD_${suffix}`],
    `NAP_ADMIN_PSWD_${suffix}`
  );
  const appPassword = secret(
    env[`NAP_APP_PSWD_${suffix}`],
    `NAP_APP_PSWD_${suffix}`
  );
  const target = endpoint(
    env[`ADMIN_DATABASE_${suffix}`],
    `ADMIN_DATABASE_${suffix}`
  );
  const maintenance = endpoint(
    env[`SETUP_DATABASE_${suffix}`],
    `SETUP_DATABASE_${suffix}`
  );
  requireCondition(
    target.host === maintenance.host && target.search === maintenance.search,
    'ENDPOINT_MISMATCH'
  );
  return {
    environment: selected,
    database: target.pathname.slice(1),
    endpoint: env[`ADMIN_DATABASE_${suffix}`],
    maintenance: env[`SETUP_DATABASE_${suffix}`],
    adminPassword,
    appPassword,
  };
}
export function productionEnvironment(env) {
  const blueprint = fileURLToPath(
    new URL('../../../../../render.yaml', import.meta.url)
  );
  let defaults = {};
  if (existsSync(blueprint))
    defaults = Object.fromEntries(
      (parseYaml(readFileSync(blueprint, 'utf8')).services?.[0]?.envVars ?? [])
        .filter(v => v.value !== undefined)
        .map(v => [v.key, String(v.value)])
    );
  return {
    ...defaults,
    ...Object.fromEntries(Object.entries(env).filter(([, v]) => v?.trim())),
  };
}
