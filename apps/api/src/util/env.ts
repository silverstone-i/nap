/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Environment resolution for the API.
 *
 * `util/` imports nothing (PROJECT-STRUCTURE.md layer table), so this module
 * reads `process.env` directly and never reaches for a database handle.
 *
 * Connection strings carry credentials (ARCH-008), so every error here names
 * the missing variable and never echoes a value.
 */

/** The environments the API resolves configuration for. */
export type NapEnvironment = 'development' | 'test' | 'production';

/** Which database a lookup targets: the control plane, or this cell. */
export type DatabaseTarget = 'ADMIN' | 'CELL';

/**
 * Which role's credentials a lookup wants.
 *
 * `RUNTIME` is the least-privileged request-handling role; `MIGRATION` is the
 * owning role used only by release commands (ARCH-019, ARCH-025).
 */
export type DatabaseAccess = 'RUNTIME' | 'MIGRATION';

const ENVIRONMENT_SUFFIX: Readonly<Record<NapEnvironment, string>> = {
  development: 'DEV',
  test: 'TEST',
  production: 'PROD',
};

const ACCESS_SEGMENT: Readonly<Record<DatabaseAccess, string>> = {
  RUNTIME: 'DATABASE_URL',
  MIGRATION: 'MIGRATION_URL',
};

/**
 * Loads `.env` into `process.env` when the file exists.
 *
 * Uses Node's built-in loader rather than a dependency. Absent files are not
 * an error: deployments supply real environment variables instead.
 *
 * @param path - Env file to load. Defaults to `.env` in the process cwd.
 */
export function loadDotEnv(path = '.env'): void {
  try {
    process.loadEnvFile(path);
  } catch {
    // No .env on this machine or in this container; the process environment
    // is the source of truth. A genuinely missing variable fails later, at
    // the lookup that needs it, with the variable's name.
  }
}

/**
 * Resolves the current environment from `NODE_ENV`.
 *
 * @param env - Environment source. Defaults to `process.env`.
 * @returns The resolved environment; `development` when `NODE_ENV` is unset.
 * @throws {Error} If `NODE_ENV` holds an unsupported value.
 */
export function currentEnvironment(
  env: NodeJS.ProcessEnv = process.env
): NapEnvironment {
  const value = env.NODE_ENV;

  if (value === undefined || value === '') return 'development';
  if (value === 'development' || value === 'test' || value === 'production') {
    return value;
  }

  throw new Error(
    `NODE_ENV must be development, test, or production (received ${value})`
  );
}

/**
 * Builds the variable name a connection lookup reads, e.g.
 * `CELL_MIGRATION_URL_TEST`.
 *
 * @param target - Control plane or cell.
 * @param access - Runtime or migration role.
 * @param environment - Environment whose suffix is used.
 * @returns The environment-variable name.
 */
export function databaseUrlVariable(
  target: DatabaseTarget,
  access: DatabaseAccess,
  environment: NapEnvironment
): string {
  return `${target}_${ACCESS_SEGMENT[access]}_${ENVIRONMENT_SUFFIX[environment]}`;
}

/**
 * Reads the connection string for one database and role.
 *
 * @param target - Control plane or cell.
 * @param access - Runtime or migration role.
 * @param env - Environment source. Defaults to `process.env`.
 * @returns The connection string.
 * @throws {Error} If the variable is unset or empty. The message names the
 *   variable only.
 */
export function databaseUrl(
  target: DatabaseTarget,
  access: DatabaseAccess,
  env: NodeJS.ProcessEnv = process.env
): string {
  const variable = databaseUrlVariable(target, access, currentEnvironment(env));
  const value = env[variable];

  if (value === undefined || value.trim() === '') {
    throw new Error(`${variable} is not set`);
  }

  return value;
}

/**
 * Reads the least-privileged role name a database's grants are issued to.
 *
 * Migrations need the name to grant against; nothing here grants privileges
 * to a role it did not read from configuration.
 *
 * @param target - Control plane or cell.
 * @param env - Environment source. Defaults to `process.env`.
 * @returns The role name.
 * @throws {Error} If the variable is unset, empty, or not a bare identifier.
 */
export function runtimeRole(
  target: DatabaseTarget,
  env: NodeJS.ProcessEnv = process.env
): string {
  const variable = `${target}_RUNTIME_ROLE`;
  const value = env[variable]?.trim();

  if (value === undefined || value === '') {
    throw new Error(`${variable} is not set`);
  }

  // The value reaches DDL that cannot parameterize a role name, so it is
  // constrained to an unquoted PostgreSQL identifier rather than escaped.
  if (!/^[a-z_][a-z0-9_$]*$/.test(value)) {
    throw new Error(
      `${variable} must be a lowercase unquoted PostgreSQL identifier`
    );
  }

  return value;
}
