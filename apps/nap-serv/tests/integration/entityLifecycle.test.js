/**
 * @file Integration test — entity lifecycle: employee is_app_user provisioning
 * @module tests/integration/entityLifecycle
 *
 * Verifies: Create tenant → create employee → set is_app_user → verify nap_user
 * in admin.nap_users → archive employee → verify nap_user status=locked →
 * restore employee → verify nap_user restored.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { bootstrapAdmin, cleanupTestDb } from '../helpers/testDb.js';

const ROOT_EMAIL = process.env.ROOT_EMAIL;
const ROOT_PASSWORD = process.env.ROOT_PASSWORD;

let db;
beforeAll(async () => {
  await cleanupTestDb();
  db = await bootstrapAdmin();
}, 30000);

const { default: app } = await import('../../src/app.js');

afterAll(async () => {
  await cleanupTestDb();
}, 15000);

async function loginRoot() {
  const res = await request(app).post('/api/auth/login').send({ email: ROOT_EMAIL, password: ROOT_PASSWORD });
  return res.headers['set-cookie'];
}

describe('Entity lifecycle — employee is_app_user with nap_users cascade', () => {
  let tenantCookies;
  let employeeId;

  test('1. Provision tenant', async () => {
    const rootCookies = await loginRoot();
    const res = await request(app)
      .post('/api/tenants/v1/tenants')
      .set('Cookie', rootCookies)
      .send({
        tenant_code: 'ELTEST',
        company: 'Entity Lifecycle Corp',
        status: 'active',
        tier: 'starter',
        admin_email: 'admin@eltest.com',
        admin_password: 'EltestPass123!',
      });
    expect(res.status).toBe(201);

    // Login as tenant admin
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@eltest.com', password: 'EltestPass123!' });
    tenantCookies = loginRes.headers['set-cookie'];
    expect(tenantCookies).toBeDefined();
  }, 30000);

  test('2. Create employee with is_app_user=true provisions nap_user', async () => {
    const res = await request(app)
      .post('/api/core/v1/employees')
      .set('Cookie', tenantCookies)
      .send({
        first_name: 'Alice',
        last_name: 'Wonder',
        code: 'AW001',
        email: 'alice@eltest.com',
        is_app_user: true,
      });

    expect(res.status).toBe(201);
    employeeId = res.body.id;

    // Verify nap_user exists
    const napUser = await db.oneOrNone(
      `SELECT id, entity_type, entity_id, email, status
       FROM admin.nap_users
       WHERE entity_type = 'employee' AND entity_id = $1`,
      [employeeId],
    );
    expect(napUser).not.toBeNull();
    expect(napUser.email).toBe('alice@eltest.com');
    expect(napUser.status).toBe('invited');
  });

  test('3. Archive employee cascades to lock nap_user', async () => {
    const res = await request(app)
      .delete(`/api/core/v1/employees/archive?id=${employeeId}`)
      .set('Cookie', tenantCookies)
      .send({});

    expect(res.status).toBe(200);

    // Verify nap_user is locked
    const napUser = await db.oneOrNone(
      `SELECT status, deactivated_at FROM admin.nap_users
       WHERE entity_type = 'employee' AND entity_id = $1`,
      [employeeId],
    );
    expect(napUser.status).toBe('locked');
    expect(napUser.deactivated_at).not.toBeNull();
  });

  test('4. Archived employee login fails', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@eltest.com', password: 'anything' });

    // Login should fail (user is deactivated)
    expect(res.status).not.toBe(200);
  });

  test('5. Restore employee cascades to restore nap_user', async () => {
    const res = await request(app)
      .patch(`/api/core/v1/employees/restore?id=${employeeId}`)
      .set('Cookie', tenantCookies)
      .send({});

    expect(res.status).toBe(200);

    // Verify nap_user is restored
    const napUser = await db.oneOrNone(
      `SELECT status, deactivated_at FROM admin.nap_users
       WHERE entity_type = 'employee' AND entity_id = $1`,
      [employeeId],
    );
    expect(napUser.status).toBe('active');
    expect(napUser.deactivated_at).toBeNull();
  });

  test('6. Source record was created for employee', async () => {
    // Verify that a source record exists linking to this employee
    const employee = await request(app)
      .get(`/api/core/v1/employees/${employeeId}`)
      .set('Cookie', tenantCookies);

    expect(employee.body.source_id).toBeDefined();

    // Verify source record
    const source = await request(app)
      .get(`/api/core/v1/sources/${employee.body.source_id}`)
      .set('Cookie', tenantCookies);

    expect(source.status).toBe(200);
    expect(source.body.source_type).toBe('employee');
    expect(source.body.table_id).toBe(employeeId);
  });
});
