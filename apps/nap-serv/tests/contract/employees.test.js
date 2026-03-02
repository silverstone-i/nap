/**
 * @file Contract tests for employee CRUD endpoints + is_app_user lifecycle
 * @module tests/contract/employees
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

async function provisionTenant(cookies) {
  await request(app)
    .post('/api/tenants/v1/tenants')
    .set('Cookie', cookies)
    .send({
      tenant_code: 'ETEST',
      company: 'Employee Test Corp',
      status: 'active',
      tier: 'starter',
      admin_first_name: 'Test',
      admin_last_name: 'Admin',
      admin_email: 'admin@etest.com',
      admin_password: 'EtestPass123!',
    });
}

describe('Employee CRUD — /api/core/v1/employees', () => {
  let cookies;
  let employeeId;

  beforeAll(async () => {
    const rootCookies = await loginRoot();
    await provisionTenant(rootCookies);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@etest.com', password: 'EtestPass123!' });
    cookies = loginRes.headers['set-cookie'];
  }, 30000);

  test('creates an employee with auto-source linkage', async () => {
    const res = await request(app)
      .post('/api/core/v1/employees')
      .set('Cookie', cookies)
      .send({
        first_name: 'Jane',
        last_name: 'Smith',
        code: 'JS001',
        position: 'Engineer',
        department: 'Engineering',
        email: 'jane@etest.com',
      });

    expect(res.status).toBe(201);
    expect(res.body.first_name).toBe('Jane');
    expect(res.body.source_id).toBeDefined();
    expect(res.body.is_app_user).toBe(false);
    employeeId = res.body.id;
  });

  test('lists employees', async () => {
    const res = await request(app).get('/api/core/v1/employees').set('Cookie', cookies);
    expect(res.status).toBe(200);
    const rows = res.body.rows ?? res.body;
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('gets employee by id', async () => {
    const res = await request(app).get(`/api/core/v1/employees/${employeeId}`).set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe('JS001');
  });

  test('creates employee with is_app_user=true provisions nap_user', async () => {
    const res = await request(app)
      .post('/api/core/v1/employees')
      .set('Cookie', cookies)
      .send({
        first_name: 'Bob',
        last_name: 'Johnson',
        code: 'BJ001',
        email: 'bob@etest.com',
        is_app_user: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.is_app_user).toBe(true);

    // Verify nap_user was created in admin schema
    const napUser = await db.oneOrNone(
      `SELECT id, entity_type, entity_id, status FROM admin.nap_users
       WHERE entity_type = 'employee' AND entity_id = $1`,
      [res.body.id],
    );
    expect(napUser).not.toBeNull();
    expect(napUser.status).toBe('invited');
  });

  test('toggling is_app_user OFF archives nap_user', async () => {
    // Find the app-user employee
    const listRes = await request(app).get('/api/core/v1/employees').set('Cookie', cookies);
    const rows = listRes.body.rows ?? listRes.body;
    const bob = rows.find((r) => r.code === 'BJ001');

    const res = await request(app)
      .put(`/api/core/v1/employees/update?id=${bob.id}`)
      .set('Cookie', cookies)
      .send({ is_app_user: false });

    expect(res.status).toBe(200);

    // Verify nap_user was archived
    const napUser = await db.oneOrNone(
      `SELECT status, deactivated_at FROM admin.nap_users
       WHERE entity_type = 'employee' AND entity_id = $1`,
      [bob.id],
    );
    expect(napUser.status).toBe('locked');
    expect(napUser.deactivated_at).not.toBeNull();
  });

  test('archives and restores an employee', async () => {
    const archiveRes = await request(app)
      .delete(`/api/core/v1/employees/archive?id=${employeeId}`)
      .set('Cookie', cookies)
      .send({});
    expect(archiveRes.status).toBe(200);

    const restoreRes = await request(app)
      .patch(`/api/core/v1/employees/restore?id=${employeeId}`)
      .set('Cookie', cookies)
      .send({});
    expect(restoreRes.status).toBe(200);
  });
});
