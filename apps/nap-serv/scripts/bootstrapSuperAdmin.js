'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

// scripts/bootstrapSuperAdmin.js
import 'dotenv/config.js';
import bcrypt from 'bcrypt';
import { db } from '../src/db/db.js'; // Adjust the import path as necessary
import { fileURLToPath } from 'url';

async function bootstrapSuperAdmin() {
  const { ROOT_EMAIL, ROOT_PASSWORD, NAPSOFT_TENANT } = process.env;

  if (!ROOT_EMAIL || !ROOT_PASSWORD) {
    console.error('❌ Missing ROOT_EMAIL or ROOT_PASSWORD in .env');
    process.exit(1);
  }

  try {
    console.log('🔐 Checking for existing super admin...');

    const existingUsers = await db.napUsers.findWhere([{ role: 'super_admin' }]);

    if (existingUsers.length > 0) {
      console.log('✅ Super admin already exists. Aborting.');
      return;
    }

    const passwordHash = await bcrypt.hash(ROOT_PASSWORD, 10);

    const userDto = {
      tenant_code: NAPSOFT_TENANT || 'NAPSFT',
      schema_name: NAPSOFT_TENANT?.toLocaleLowerCase() || 'napsft',
      email: ROOT_EMAIL,
      password_hash: passwordHash,
      role: 'super_admin',
      user_name: 'administrator',
      created_by: 'administrator',
    };

    await db.napUsers.insert(userDto);
    console.log('✅ Super admin created successfully.');
  } catch (err) {
    console.error('❌ Error bootstrapping super admin:', err);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  bootstrapSuperAdmin();
}

export { bootstrapSuperAdmin };