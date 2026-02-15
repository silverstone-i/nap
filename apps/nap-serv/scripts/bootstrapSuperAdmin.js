/**
 * @file Bootstrap script — creates NapSoft tenant & super_admin user, seeds RBAC
 * @module nap-serv/scripts/bootstrapSuperAdmin
 *
 * Can be executed directly: node scripts/bootstrapSuperAdmin.js
 * When run directly, it also triggers migrations for the admin and tenant schemas.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import 'dotenv/config';
import bcrypt from 'bcrypt';
import { db } from '../src/db/db.js';
import { fileURLToPath } from 'url';

const { seedRbac } = await import('../src/modules/core/seeds/seed_rbac.js');

function resolveTenantCode(overrideTenantCode) {
  if (overrideTenantCode) return overrideTenantCode.toUpperCase();
  const { NAPSOFT_TENANT } = process.env;
  return (NAPSOFT_TENANT || 'NAP').toUpperCase();
}

async function bootstrapSuperAdmin({ tenantCode: overrideTenantCode } = {}) {
  const { ROOT_EMAIL, ROOT_PASSWORD, BCRYPT_ROUNDS } = process.env;

  if (!ROOT_EMAIL || !ROOT_PASSWORD) {
    console.error('Missing ROOT_EMAIL or ROOT_PASSWORD in .env');
    process.exit(1);
  }

  try {
    const tenantCode = resolveTenantCode(overrideTenantCode);
    const tenantSchema = tenantCode.toLowerCase();
    const rounds = parseInt(BCRYPT_ROUNDS || '12', 10);

    // 1) Ensure NapSoft tenant exists
    console.log('Ensuring NapSoft tenant exists...');
    const existingTenant = await db.tenants.findWhere([{ tenant_code: tenantCode }]);

    let tenantId;
    if (existingTenant.length === 0) {
      const tenant = await db.tenants.insert({
        tenant_code: tenantCode,
        schema_name: tenantSchema,
        company: 'NapSoft',
        status: 'active',
        created_by: null,
      });
      tenantId = tenant.id;
      console.log('NapSoft tenant created.');
    } else {
      tenantId = existingTenant[0].id;
      console.log('NapSoft tenant already exists.');
    }

    // 2) Ensure super_admin user exists
    const existingUsers = await db.napUsers.findWhere([{ role: 'super_admin' }]);

    if (existingUsers.length > 0) {
      console.log('Super admin already exists. Skipping user creation.');
    } else {
      const passwordHash = await bcrypt.hash(ROOT_PASSWORD, rounds);

      await db.napUsers.insert({
        tenant_id: tenantId,
        tenant_code: tenantCode,
        email: ROOT_EMAIL,
        password_hash: passwordHash,
        role: 'super_admin',
        user_name: 'super_admin',
        full_name: 'Super Admin',
        status: 'active',
        tenant_role: 'admin',
        created_by: null,
      });
      console.log('super_admin created with tenant_role=admin.');
    }

    // 3) Seed RBAC for admin schema
    try {
      await seedRbac({ schemaName: 'admin' });
      console.log('RBAC seeded for admin.');
    } catch (e) {
      console.warn('RBAC seeding during bootstrap failed:', e?.message || e);
    }
  } catch (err) {
    console.error('Error bootstrapping super_admin:', err);
    process.exit(1);
  }
}

// Allow direct execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tenantCode = resolveTenantCode();
  const tenantSchema = tenantCode.toLowerCase();
  const schemaList = [...new Set(['admin', tenantSchema])];

  try {
    const { migrateTenants } = await import('./migrateTenants.js');
    await migrateTenants({ schemaList });
    console.log('Migrations complete; super admin ensured.');
  } catch (err) {
    console.error('Error running migrations during bootstrap:', err?.message || err);
    process.exit(1);
  }

  process.exit(0);
}

export { bootstrapSuperAdmin };
