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
import migrateTenants from '../../src/utils/migrateTenants.js';
import app from '../../src/app.js';

/**
 * Sets up the integration test environment.
 * Drops and recreates specified schemas, runs migrations, and starts the server.
 *
 * @param {string[]} schemaList - List of schemas to reset and runMigrate. Defaults to ['admin'].
 * @returns {Promise<{ server: import('http').Server, teardown: Function }>}
 */
export async function setupIntegrationTest(schemaList = ['tenantid']) {
  console.log('schemaList:', schemaList);
  
  // // Drop and recreate schemas, but skip 'public'
  // try {
  // for (const schema of schemaList) {
  //   if (schema !== 'public') {
  //     console.log('Dropping and recreating schema:', schema);
      
  //     await db.none(`DROP SCHEMA IF EXISTS ${schema} CASCADE; CREATE SCHEMA ${schema};`);
  //   }
  // }
  // }
  // catch (error) {
  //   console.error('Error dropping and recreating schemas:', error);
  //   // throw error;
  // }
  
  // Run migrations
  await migrateTenants({testFlag: true});

  // Start the server
  const server = app.listen();

  // Return server instance and teardown function
  return {
    server,
    teardown: async () => {
      await server.close();
      if (!db.$pool.ended) {
        await db.$pool.end();
      }
    },
  };
}
