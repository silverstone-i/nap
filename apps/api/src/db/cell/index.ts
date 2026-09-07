/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createDb } from 'pg-schemata';
import { createDatabaseLogger } from '../../util/logger.js';
import type {
  Database,
  DatabaseConfig,
  RepositoryCtor,
  RepositoryInstances,
} from 'pg-schemata';

const cellHandle = Symbol('cellDatabase');
/**
 * Does: Types a connection pool for a cell database, carrying its registered
 * repositories and marked so it cannot be passed where an admin database is
 * expected.
 * Used by: withTenantTransaction and everything that receives the pool from
 * createCellDatabase.
 * Why: the marker is a private symbol, so the only way to obtain this type
 * is through createCellDatabase.
 */
export type CellDatabase<R = Record<never, never>> = Database<R> & {
  readonly [cellHandle]: true;
};

/**
 * Does: Creates a connection pool for a cell database with the shared logger
 * adapter, a five-second connection timeout, and any repositories and pool
 * settings the caller supplies.
 * Called by: server startup, migrateDatabase, and database test fixtures.
 * Why: this only creates the pool. The caller opens it with connect and
 * must close it, so tests and the migration runner control its lifetime.
 */
export function createCellDatabase<
  const C extends Record<string, RepositoryCtor> = Record<never, never>,
>(
  connectionString: string,
  options: Pick<DatabaseConfig<C>, 'repositories' | 'pool'> = {}
): CellDatabase<RepositoryInstances<C>> {
  return Object.assign(
    createDb({
      connectionString,
      logger: createDatabaseLogger('cell'),
      repositories: options.repositories,
      pool: { connectionTimeoutMillis: 5000, ...options.pool },
    }),
    { [cellHandle]: true as const }
  );
}
