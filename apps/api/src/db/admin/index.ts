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

const adminHandle = Symbol('adminDatabase');
/**
 * Does: Types a connection pool for the admin database, carrying its
 * registered repositories and marked so it cannot be passed where a cell
 * database is expected.
 * Used by: withAdminTransaction, the framework controllers, and everything
 * that receives the pool from createAdminDatabase.
 * Why: the marker is a private symbol, so the only way to obtain this type
 * is through createAdminDatabase.
 */
export type AdminDatabase<R = Record<never, never>> = Database<R> & {
  readonly [adminHandle]: true;
};

/**
 * Does: Creates a connection pool for the admin database with the shared
 * logger adapter, a five-second connection timeout, and any repositories and
 * pool settings the caller supplies.
 * Called by: server startup, migrateDatabase, and database test fixtures.
 * Why: this only creates the pool. The caller opens it with connect and
 * must close it, so tests and the migration runner control its lifetime.
 */
export function createAdminDatabase<
  const C extends Record<string, RepositoryCtor> = Record<never, never>,
>(
  connectionString: string,
  options: Pick<DatabaseConfig<C>, 'repositories' | 'pool'> = {}
): AdminDatabase<RepositoryInstances<C>> {
  return Object.assign(
    createDb({
      connectionString,
      logger: createDatabaseLogger('admin'),
      repositories: options.repositories,
      pool: { connectionTimeoutMillis: 5000, ...options.pool },
    }),
    { [adminHandle]: true as const }
  );
}

/**
 * Does: Returns true when a database pool was created by createAdminDatabase.
 * Called by: the framework controller base class when it records which
 * database a controller is bound to.
 * Why: the admin and cell pools share one library type, so the private
 * marker is the only runtime evidence of which database a pool reaches.
 */
export function isAdminDatabase<R>(
  value: Database<R>
): value is AdminDatabase<R> {
  return adminHandle in value;
}
