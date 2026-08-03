/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { DB, db, pgp } from 'pg-schemata';
import type { ExtendedDb, Logger } from 'pg-schemata';
import { collectRepositories, moduleRegistry } from './registry.js';
import type { NapModule } from './registry.js';

/** The DATABASE_URL_* variable each NODE_ENV selects. */
const URL_VAR_BY_ENV = {
  production: 'DATABASE_URL_PROD',
  test: 'DATABASE_URL_TEST',
  development: 'DATABASE_URL_DEV',
} as const;

/**
 * Picks the connection string for the given environment. Takes `env` as an
 * argument rather than reading `process.env`: startup config is read at the
 * entrypoint (see RULES/api-server.md), and a pure function is testable
 * without mutating the process environment.
 *
 * @param env - The environment to read. Any NODE_ENV other than 'production'
 *   or 'test' resolves to the development URL.
 * @throws {Error} When the selected variable is missing or empty.
 */
export function resolveConnectionString(env: NodeJS.ProcessEnv): string {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const variable =
    nodeEnv === 'production' || nodeEnv === 'test'
      ? URL_VAR_BY_ENV[nodeEnv]
      : URL_VAR_BY_ENV.development;
  const value = env[variable]?.trim();

  if (!value) {
    throw new Error(
      `${variable} is not set (required because NODE_ENV is "${nodeEnv}")`
    );
  }

  return value;
}

let initialized: string | undefined;
let closed = false;

/**
 * Initializes the pg-schemata singleton with every registered module's
 * repositories. Call once, at startup.
 *
 * pg-schemata's `DB.init` silently ignores a second call, which would hand
 * back a handle pointing at the first connection; this wrapper throws instead
 * so the mistake surfaces where it is made.
 *
 * @param connection - Postgres connection string.
 * @param logger - Logger handed to every repository.
 * @param modules - Registry to draw repositories from. Defaults to the real one.
 * @throws {Error} When called a second time, or after {@link closeDb}.
 */
export function initDb(
  connection: string,
  logger: Logger | null = null,
  modules: readonly NapModule[] = moduleRegistry
): ExtendedDb {
  if (closed) {
    throw new Error(
      'initDb() called after closeDb(); the pg-schemata singleton is terminal'
    );
  }
  if (initialized !== undefined) {
    throw new Error('initDb() called twice; the pg-schemata DB is a singleton');
  }

  DB.init(connection, collectRepositories(modules), logger);
  initialized = connection;
  return db();
}

/** True once {@link initDb} has run in this process. */
export function isDbInitialized(): boolean {
  return initialized !== undefined;
}

/**
 * The initialized database handle. pg-schemata's own `db()` returns undefined
 * before init; this throws instead, naming the cause.
 *
 * @throws {Error} When {@link initDb} has not run.
 */
export function getDb(): ExtendedDb {
  if (closed) {
    throw new Error('Database closed — closeDb() is terminal');
  }
  if (initialized === undefined) {
    throw new Error('Database not initialized — call initDb() at startup');
  }
  return db();
}

/**
 * Round-trips a trivial query so an unreachable database fails at startup
 * rather than on the first request.
 */
export async function probeDb(): Promise<void> {
  await getDb().one('SELECT 1 AS ok');
}

/**
 * Drains the connection pool. Terminal: the pg-schemata singleton cannot be
 * re-initialized afterwards, so this is process shutdown only — {@link getDb}
 * and {@link initDb} throw once this has run.
 */
export function closeDb(): void {
  if (initialized === undefined || closed) return;
  closed = true;
  pgp().end();
}
