/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createDb } from 'pg-schemata';
import { createDatabaseLogger } from '../../util/logger.js';
import type { Database } from 'pg-schemata';

const adminHandle = Symbol('adminDatabase');
/**
 * Does: Types a connection pool for the admin database, marked so it cannot
 * be passed where a cell database is expected.
 * Used by: everything that receives the pool from createAdminDatabase.
 * Why: the marker is a private symbol, so the only way to obtain this type
 * is through createAdminDatabase.
 */
export type AdminDatabase = Database & { readonly [adminHandle]: true };

/**
 * Does: Creates a connection pool for the admin database with the shared
 * logger adapter and a five-second connection timeout.
 * Called by: server startup and migrateDatabase.
 * Why: this only creates the pool. The caller opens it with connect and
 * must close it, so tests and the migration runner control its lifetime.
 * The admin database registers no repositories yet.
 */
export function createAdminDatabase(connectionString: string): AdminDatabase {
  return Object.assign(
    createDb({
      connectionString,
      logger: createDatabaseLogger('admin'),
      repositories: {},
      pool: { connectionTimeoutMillis: 5000 },
    }),
    { [adminHandle]: true as const }
  );
}
