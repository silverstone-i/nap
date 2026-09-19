/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createDb } from 'pg-schemata';
import { repositories } from '../../modules/admin-tenancy/repositories.js';
/**
 * Create an unconnected pg-schemata handle for the admin database with a
 * pool of four connections and a 5 second connection timeout.
 * @param {string} connection Connection string with role credentials.
 * @param {object} [models=repositories] Table name to model map.
 * @returns {import('pg-schemata').Database}
 */
export function createAdminDatabase(connection, models = repositories) {
  return createDb({
    connectionString: connection,
    repositories: models,
    logger: null,
    auditActorResolver: () => null,
    pool: { max: 4, connectionTimeoutMillis: 5000 },
  });
}
/**
 * Open a repository-free handle, run `operation`, and always close it.
 * @template T
 * @param {string} connection
 * @param {(db: import('pg-promise').IDatabase<unknown>, pgp: import('pg-promise').IMain) => Promise<T>} operation
 * @returns {Promise<T>}
 */
export async function using(connection, operation) {
  const handle = createAdminDatabase(connection, {});
  try {
    await handle.connect();
    return await operation(handle.db, handle.pgp);
  } finally {
    await handle.close();
  }
}
