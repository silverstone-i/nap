/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { readFileSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { requireCondition, MaintenanceError } from './errors.js';
/**
 * Parse maintenance CLI arguments.
 * @param {string[]} args Arguments after the script name; only `--env <dev|test|prod>` is accepted.
 * @returns {'dev'|'test'|'prod'} The selected environment.
 * @throws {MaintenanceError} `INVALID_ARGUMENTS`
 */
export function argumentsFor(args) {
  requireCondition(
    args.length === 2 &&
      args[0] === '--env' &&
      ['dev', 'test', 'prod'].includes(args[1]),
    'INVALID_ARGUMENTS'
  );
  return args[1];
}
/**
 * Load the API-local `.env` file, or the file named by `NAP_ENV_FILE`, and
 * merge it beneath the process environment so inherited variables win.
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {Record<string, string | undefined>}
 * @throws {MaintenanceError} `MISSING_ENV_FILE` when `NAP_ENV_FILE` names an absent file; `INVALID_ENV_FILE` when the file cannot be parsed.
 */
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
/**
 * Validate a database endpoint of the form `host:port/database?options`.
 * Credentials, a protocol prefix, a fragment, and options other than
 * `sslmode`, `sslcert`, `sslkey`, `sslrootcert`, and `application_name`
 * are rejected.
 * @param {unknown} value Endpoint text.
 * @param {string} setting Setting name reported on failure; never the value.
 * @returns {URL} Parsed `postgresql://` URL without credentials.
 * @throws {MaintenanceError} `INVALID_CONFIGURATION`
 */
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
/**
 * Build a connection string for one database role.
 * @param {string} value Endpoint accepted by `endpoint`.
 * @param {string} role PostgreSQL role name.
 * @param {string} password Role password.
 * @returns {string} `postgresql://` URL with credentials. Never log it.
 */
export function roleUrl(value, role, password) {
  const url = endpoint(value, 'database endpoint');
  url.username = role;
  url.password = password;
  return url.href;
}
/**
 * Require a nonempty secret that contains no `<placeholder>` markers left
 * over from `.env.example`.
 * @param {unknown} value
 * @param {string} setting Setting name reported on failure.
 * @returns {string}
 * @throws {MaintenanceError} `INVALID_CONFIGURATION`
 */
export function secret(value, setting) {
  requireCondition(
    typeof value === 'string' && value.length > 0 && !/[<>]/.test(value),
    'INVALID_CONFIGURATION',
    setting
  );
  return value;
}
/**
 * Resolve the `dev` or `test` maintenance configuration from `*_<ENV>`
 * settings. The maintenance and target endpoints must share host, port, and
 * connection options.
 * @param {'dev'|'test'} selected
 * @param {Record<string, string | undefined>} env
 * @returns {{environment: string, database: string, endpoint: string, maintenance: string, adminPassword: string, appPassword: string}}
 * @throws {MaintenanceError} `INVALID_CONFIGURATION` or `ENDPOINT_MISMATCH`
 */
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
/**
 * Layer production settings: nonblank environment values override the
 * nonsecret defaults read from the first service in `render.yaml`.
 * @param {Record<string, string | undefined>} env
 * @returns {Record<string, string>}
 */
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
/**
 * Resolve the owning tenant's configured identity and the root user's
 * initial credential, per M0001-02 §10: "the root email and initial
 * password come from environment-specific secret configuration."
 * @param {'dev'|'test'|'prod'} selected
 * @param {Record<string, string | undefined>} env
 * @returns {{tenantCode: string, tenantName: string, rootEmail: string, rootPassword: string}}
 * @throws {MaintenanceError} `INVALID_CONFIGURATION`
 */
export function bootstrapSecrets(selected, env) {
  const suffix = selected.toUpperCase();
  return {
    tenantCode: secret(
      env[`ROOT_TENANT_CODE_${suffix}`],
      `ROOT_TENANT_CODE_${suffix}`
    ),
    tenantName: secret(env[`ROOT_COMPANY_${suffix}`], `ROOT_COMPANY_${suffix}`),
    rootEmail: secret(env[`ROOT_EMAIL_${suffix}`], `ROOT_EMAIL_${suffix}`),
    rootPassword: secret(
      env[`ROOT_PASSWORD_${suffix}`],
      `ROOT_PASSWORD_${suffix}`
    ),
  };
}
/**
 * Parse the published `ADMIN_DATABASE_PROD` entry into a connection config
 * for bootstrap, which assumes setup and migration have already run and so
 * needs only the resolved endpoint and role passwords, not Render's resource
 * reconciliation.
 * @param {Record<string, string | undefined>} env
 * @returns {{endpoint: string, adminPassword: string, appPassword: string}}
 * @throws {MaintenanceError} `INVALID_CONFIGURATION`
 */
export function productionAdminConnection(env) {
  let parsed;
  try {
    parsed = JSON.parse(env.ADMIN_DATABASE_PROD);
    requireCondition(
      parsed && typeof parsed === 'object',
      'INVALID_CONFIGURATION',
      'ADMIN_DATABASE_PROD'
    );
  } catch {
    throw new MaintenanceError('INVALID_CONFIGURATION', 'ADMIN_DATABASE_PROD');
  }
  endpoint(parsed.endpoint, 'ADMIN_DATABASE_PROD');
  return {
    endpoint: parsed.endpoint,
    adminPassword: secret(parsed.adminPassword, 'ADMIN_DATABASE_PROD'),
    appPassword: secret(parsed.appPassword, 'ADMIN_DATABASE_PROD'),
  };
}
/**
 * Resolve the Argon2id parameters shared across every environment. Floors
 * match M0001-03 §7; a deployment may raise a value but never lower it.
 * @param {Record<string, string | undefined>} env
 * @returns {{memoryKib: number, timeCost: number, parallelism: number}}
 * @throws {MaintenanceError} `INVALID_CONFIGURATION` naming the offending setting.
 */
export function argon2PolicyFromEnv(env) {
  const parameters = [
    ['ARGON2_MEMORY_KIB', 19456, 1048576, 'memoryKib'],
    ['ARGON2_TIME_COST', 2, 16, 'timeCost'],
    ['ARGON2_PARALLELISM', 1, 16, 'parallelism'],
  ];
  const hashing = {};
  for (const [setting, floor, ceiling, field] of parameters) {
    const value = Number(env[setting]?.trim() || String(floor));
    requireCondition(
      Number.isInteger(value) && value >= floor && value <= ceiling,
      'INVALID_CONFIGURATION',
      setting
    );
    hashing[field] = value;
  }
  return hashing;
}
