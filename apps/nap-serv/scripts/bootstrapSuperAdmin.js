'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

// scripts/bootstrapsuper_admin.js
import 'dotenv/config.js';
import bcrypt from 'bcrypt';
import { db } from '../src/db/db.js'; // DB accessor with schema-aware models
import { fileURLToPath } from 'url';
const { seedRbac } = await import('../src/seeds/seed_rbac.js');
import migrator from '../src/db/migrations/index.js';
import { getModulesForSchema } from '../src/db/migrations/moduleScopes.js';

async function bootstrapSuperAdmin() {
  const { ROOT_EMAIL, ROOT_PASSWORD, NAPSOFT_TENANT } = process.env;

  if (!ROOT_EMAIL || !ROOT_PASSWORD) {
    console.error('❌ Missing ROOT_EMAIL or ROOT_PASSWORD in .env');
    process.exit(1);
  }

  try {
    const tenantCode = (NAPSOFT_TENANT || 'ADMIN').toUpperCase();
    const tenantSchema = tenantCode.toLowerCase();

    // Ensure schemas exist
    await db.none(`CREATE SCHEMA IF NOT EXISTS admin;`);
    await db.none(`CREATE SCHEMA IF NOT EXISTS ${tenantSchema};`);

    console.log('🧱 Ensuring admin schema migrations have run...');
    await migrator.run({
      schema: 'admin',
      modules: getModulesForSchema('admin'),
      advisoryLock: 424242,
    });

    if (tenantSchema !== 'admin') {
      console.log(`🏗️ Ensuring tenant schema "${tenantSchema}" migrations have run...`);
      await migrator.run({
        schema: tenantSchema,
        modules: getModulesForSchema(tenantSchema),
        advisoryLock: 424242,
      });
    }

    console.log('🔐 Checking for existing super admin...');

    console.log('🏢 Ensuring NapSoft tenant exists...');
    const existingTenant = await db.tenants.findWhere([{ tenant_code: tenantCode }]);

    if (existingTenant.length === 0) {
      await db.tenants.insert({
        tenant_code: tenantCode,
        schema_name: tenantSchema,
        company: 'NapSoft',
        is_active: true,
        created_by: 'bootstrap',
      });
      console.log('✅ NapSoft tenant created.');
    } else {
      console.log('✅ NapSoft tenant already exists.');
    }

    const existingUsers = await db.napUsers.findWhere([{ role: 'super_admin' }]);

    if (existingUsers.length > 0) {
      console.log('✅ Super admin already exists. Aborting.');
      return;
    }

    const passwordHash = await bcrypt.hash(ROOT_PASSWORD, 10);

    const userDto = {
      tenant_code: tenantCode,
      schema_name: tenantSchema,
      email: ROOT_EMAIL,
      password_hash: passwordHash,
      role: 'super_admin',
      user_name: 'super_admin',
      created_by: 'bootstrap',
    };

    await db.napUsers.insert(userDto);
    console.log('✅ super_admin created successfully.');

    // Seed RBAC for admin only
    try {
      await seedRbac({ schemaName: 'admin', createdBy: 'bootstrap' });
      console.log('✅ RBAC seeded for admin');
    } catch (e) {
      console.warn('⚠️ RBAC seeding during bootstrap failed:', e?.message || e);
    }
  } catch (err) {
    console.error('❌ Error bootstrapping super_admin:', err);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  bootstrapSuperAdmin();
}

export { bootstrapSuperAdmin };
