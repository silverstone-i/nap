/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createDb } from 'pg-schemata';
import { repositories as cellTenancy } from '../../modules/cell-tenancy/repositories.js';
import { repositories as accessControl } from '../../modules/access-control/repositories.js';
import { repositories as referenceData } from '../../modules/reference-data/repositories.js';

/** Every cell module's table name to model map. */
const repositories = { ...cellTenancy, ...referenceData, ...accessControl };
/**
 * Create an unconnected pg-schemata handle for one cell database with a pool
 * of four connections and a 5 second connection timeout.
 * @param {string} connection Connection string with role credentials.
 * @param {object} [models=repositories] Table name to model map.
 * @returns {import('pg-schemata').Database}
 */
export function createCellDatabase(connection, models = repositories) {
  return createDb({
    connectionString: connection,
    repositories: models,
    logger: null,
    auditActorResolver: () => null,
    pool: { max: 4, connectionTimeoutMillis: 5000 },
  });
}
