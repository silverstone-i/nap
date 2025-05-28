'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

import { db, pgp } from '../src/db/db.js';

const adminTables = ['tenants', 'napUsers'];

async function setupAdminSchema() {
  try {
    console.log('🔧 Initializing admin schema...');
    await db.none(`CREATE SCHEMA IF NOT EXISTS admin;`);

    for (const key of adminTables) {
      const model = db[key];
      // const adminModel = callDb(model, 'admin');
      console.log(`🔨 Creating admin table: ${model.tableName}`);
      await model.createTable();
    }

    console.log('✅ Admin schema setup complete.');
  } catch (err) {
    console.error('❌ Error setting up admin schema:', err.message);
    console.error(err.stack);
  } finally {
    await pgp.end();
  }
}

setupAdminSchema();