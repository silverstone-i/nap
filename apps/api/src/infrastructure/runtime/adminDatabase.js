/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createDb } from 'pg-schemata';
import { repositories } from '../../modules/admin-tenancy/repositories.js';
export function createAdminDatabase(connection, models = repositories) {
  return createDb({
    connectionString: connection,
    repositories: models,
    logger: null,
    auditActorResolver: () => null,
    pool: { max: 4, connectionTimeoutMillis: 5000 },
  });
}
export async function using(connection, operation) {
  const handle = createAdminDatabase(connection, {});
  try {
    await handle.connect();
    return await operation(handle.db, handle.pgp);
  } finally {
    await handle.close();
  }
}
