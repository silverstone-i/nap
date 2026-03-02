/**
 * @file Integration test — tenant lifecycle: create → verify schema → archive → restore
 * @module tests/integration/tenantLifecycle
 *
 * Verifies end-to-end tenant provisioning, schema creation, RBAC seeding,
 * archive cascade to users, and restore behaviour.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { bootstrapAdmin, cleanupTestDb, DB } from '../helpers/testDb.js';

const ROOT_EMAIL = process.env.ROOT_EMAIL;
const ROOT_PASSWORD = process.env.ROOT_PASSWORD;

let db;
beforeAll(async () => {
  await cleanupTestDb();
  db = await bootstrapAdmin();
}, 30000);

const { default: app } = await import('../../src/app.js');

afterAll(async () => {
  // Clean up provisioned schemas
  for (const s of ['testco', 'numco', 'nonum']) {
    try {
      await db.none(`DROP SCHEMA IF EXISTS ${s} CASCADE`);
    } catch {
      /* ignore */
    }
  }
  await cleanupTestDb();
}, 15000);

async function loginRoot() {
  const res = await request(app).post('/api/auth/login').send({ email: ROOT_EMAIL, password: ROOT_PASSWORD });
  return res.headers['set-cookie'];
}

describe('Tenant lifecycle — create, provision, archive, restore', () => {
  let tenantId;
  let adminUserId;
  const TENANT_CODE = 'TESTCO';

  test('1. Create tenant with provisioning', async () => {
    const cookies = await loginRoot();

    const res = await request(app)
      .post('/api/tenants/v1/tenants')
      .set('Cookie', cookies)
      .send({
        tenant_code: TENANT_CODE,
        company: 'Test Company Inc',
        status: 'active',
        tier: 'growth',
        admin_first_name: 'Admin',
        admin_last_name: 'User',
        admin_email: 'admin@testco.com',
        admin_password: 'TestCoPass123!',
      });

    expect(res.status).toBe(201);
    tenantId = res.body.id;
    adminUserId = res.body.admin_user_id;
    expect(tenantId).toBeDefined();
    expect(adminUserId).toBeDefined();
    expect(res.body.schema_name).toBe('testco');
  });

  test('2. Verify tenant schema was created in PostgreSQL', async () => {
    const result = await db.oneOrNone(
      "SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'testco'",
    );
    expect(result).not.toBeNull();
    expect(result.schema_name).toBe('testco');
  });

  test('3. Verify RBAC tables exist in tenant schema', async () => {
    const tables = await db.any(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'testco' ORDER BY table_name",
    );
    const tableNames = tables.map((t) => t.table_name);

    // Should have at least roles and policies from RBAC migrations
    expect(tableNames).toContain('roles');
    expect(tableNames).toContain('policies');
  });

  test('4. Verify admin user was created for the tenant', async () => {
    const user = await db.oneOrNone('SELECT * FROM admin.nap_users WHERE id = $1', [adminUserId]);
    expect(user).not.toBeNull();
    expect(user.email).toBe('admin@testco.com');
    expect(user.tenant_id).toBe(tenantId);
    expect(user.status).toBe('active');
    expect(user.password_hash).toBeDefined();
    expect(user.password_hash.startsWith('$2')).toBe(true); // bcrypt
  });

  test('5. Admin user can log in', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'admin@testco.com',
      password: 'TestCoPass123!',
    });
    expect(res.status).toBe(200);
  });

  test('6. Archive tenant — cascades deactivation to users', async () => {
    const cookies = await loginRoot();

    const res = await request(app)
      .delete(`/api/tenants/v1/tenants/archive?id=${tenantId}`)
      .set('Cookie', cookies)
      .send({});

    expect(res.status).toBe(200);

    // Verify tenant is deactivated
    const tenant = await db.oneOrNone('SELECT * FROM admin.tenants WHERE id = $1', [tenantId]);
    expect(tenant.deactivated_at).not.toBeNull();

    // Verify admin user was cascaded
    const user = await db.oneOrNone('SELECT * FROM admin.nap_users WHERE id = $1', [adminUserId]);
    expect(user.deactivated_at).not.toBeNull();
  });

  test('7. Archived user cannot log in', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'admin@testco.com',
      password: 'TestCoPass123!',
    });
    // Could be 400 or 401 depending on how deactivated users are handled
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test('8. Restore tenant — tenant reactivated but users remain archived', async () => {
    const cookies = await loginRoot();

    const res = await request(app)
      .patch(`/api/tenants/v1/tenants/restore?id=${tenantId}`)
      .set('Cookie', cookies)
      .send({});

    expect(res.status).toBe(200);

    // Tenant should be active again
    const tenant = await db.oneOrNone('SELECT * FROM admin.tenants WHERE id = $1', [tenantId]);
    expect(tenant.deactivated_at).toBeNull();

    // User should still be archived (users must be restored individually)
    const user = await db.oneOrNone('SELECT * FROM admin.nap_users WHERE id = $1', [adminUserId]);
    expect(user.deactivated_at).not.toBeNull();
  });
});

describe('Employee auto-numbering — backfill on enable', () => {
  let numcoTenantId;
  let numcoCookies;

  test('1. Create tenant — admin employee starts with no code', async () => {
    const cookies = await loginRoot();

    const res = await request(app)
      .post('/api/tenants/v1/tenants')
      .set('Cookie', cookies)
      .send({
        tenant_code: 'NUMCO',
        company: 'Numbering Co',
        status: 'active',
        tier: 'starter',
        admin_first_name: 'Jane',
        admin_last_name: 'Doe',
        admin_email: 'jane@numco.com',
        admin_password: 'NumCoPass123!',
      });

    expect(res.status).toBe(201);
    numcoTenantId = res.body.id;

    // Numbering config should be seeded but disabled
    const config = await db.oneOrNone(
      "SELECT is_enabled FROM numco.tenant_numbering_config WHERE id_type = 'employee'",
    );
    expect(config.is_enabled).toBe(false);

    // Admin employee should have no code yet
    const emp = await db.oneOrNone('SELECT code FROM numco.employees WHERE tenant_id = $1', [numcoTenantId]);
    expect(emp).not.toBeNull();
    expect(emp.code).toBeNull();
  });

  test('2. Enable employee numbering — backfills admin code', async () => {
    // Login as numco admin
    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'jane@numco.com',
      password: 'NumCoPass123!',
    });
    expect(loginRes.status).toBe(200);
    numcoCookies = loginRes.headers['set-cookie'];

    // Find the employee numbering config id
    const configRes = await request(app)
      .get('/api/core/v1/numbering-config/where?id_type=employee')
      .set('Cookie', numcoCookies);
    expect(configRes.status).toBe(200);
    const empConfig = configRes.body.records[0];
    expect(empConfig).toBeDefined();

    // Enable employee numbering
    const updateRes = await request(app)
      .put(`/api/core/v1/numbering-config/update?id=${empConfig.id}`)
      .set('Cookie', numcoCookies)
      .send({ is_enabled: true });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.updatedRecords).toBe(1);
    expect(updateRes.body.backfilledCodes).toBe(1);

    // Admin employee should now have a code
    const emp = await db.oneOrNone('SELECT code FROM numco.employees WHERE tenant_id = $1', [numcoTenantId]);
    expect(emp.code).toBeTruthy();
    expect(emp.code).toMatch(/^EMP/);
  });

  test('3. Employee created via API gets auto-code when numbering enabled', async () => {
    const res = await request(app)
      .post('/api/core/v1/employees')
      .set('Cookie', numcoCookies)
      .send({
        first_name: 'Bob',
        last_name: 'Smith',
        email: 'bob@numco.com',
      });

    expect(res.status).toBe(201);
    expect(res.body.code).toBeTruthy();
    expect(res.body.code).toMatch(/^EMP/);
  });

  test('4. Employee with explicit code keeps it (no auto-numbering)', async () => {
    const res = await request(app)
      .post('/api/core/v1/employees')
      .set('Cookie', numcoCookies)
      .send({
        first_name: 'Alice',
        last_name: 'Jones',
        email: 'alice@numco.com',
        code: 'CUSTOM01',
      });

    expect(res.status).toBe(201);
    expect(res.body.code).toBe('CUSTOM01');
  });

  test('5. Tenant without numbering — admin has no code', async () => {
    const cookies = await loginRoot();

    const res = await request(app)
      .post('/api/tenants/v1/tenants')
      .set('Cookie', cookies)
      .send({
        tenant_code: 'NONUM',
        company: 'No Numbering Co',
        status: 'active',
        tier: 'starter',
        admin_first_name: 'Sam',
        admin_last_name: 'Lee',
        admin_email: 'sam@nonum.com',
        admin_password: 'NoNumPass123!',
      });

    expect(res.status).toBe(201);

    const emp = await db.oneOrNone('SELECT code FROM nonum.employees WHERE tenant_id = $1', [res.body.id]);
    expect(emp).not.toBeNull();
    expect(emp.code).toBeNull();
  });
});
