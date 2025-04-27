'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

import { db } from '../../src/db/db.js';
import runMigrate from '../../scripts/runMigrate.js';
import app from '../../src/app.js';

/**
 * Sets up the integration test environment.
 * Drops and recreates specified schemas, runs migrations, and starts the server.
 *
 * @param {string[]} schemaList - List of schemas to reset and runMigrate. Defaults to ['admin'].
 * @returns {Promise<{ server: import('http').Server, teardown: Function }>}
 */
export async function setupIntegrationTest(schemaList = ['admin']) {
  // Drop and recreate schemas
  await Promise.all(
    schemaList.map(schema =>
      db.none(`DROP SCHEMA IF EXISTS ${schema} CASCADE; CREATE SCHEMA ${schema};`)
    )
  );

  // Run migrations
  await runMigrate(db,{ schemas: schemaList },true );

  // Start the server
  const server = app.listen();

  // Return server instance and teardown function
  return {
    server,
    teardown: async () => {
      await server.close();
      await db.$pool.end();
    },
  };
}
