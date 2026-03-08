/**
 * @file Contract tests for change order CRUD endpoints
 * @module tests/contract/changeOrders
 *
 * Tests change orders scoped to a unit: create, list, getById, update,
 * archive, restore.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
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
      tenant_code: 'COTEST',
      company: 'Change Order Test Corp',
      status: 'active',
      tier: 'starter',
      admin_first_name: 'Test',
      admin_last_name: 'Admin',
      admin_email: 'admin@cotest.com',
      admin_password: 'CotestPass123!',
    });
}

describe('Change Order CRUD — /api/projects/v1/change-orders', () => {
  let cookies;
  let unitId;
  let coId;

  beforeAll(async () => {
    cookies = await loginRoot();
    await provisionTenant(cookies);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@cotest.com', password: 'CotestPass123!' });
    cookies = loginRes.headers['set-cookie'];

    // Create inter-company → project → unit
    const icRes = await request(app)
      .post('/api/core/v1/inter-companies')
      .set('Cookie', cookies)
      .send({ code: 'COCO', name: 'CO Test Company' });

    const projRes = await request(app)
      .post('/api/projects/v1/projects')
      .set('Cookie', cookies)
      .send({ project_code: 'COPRJ', name: 'CO Test Project', company_id: icRes.body.id });

    const unitRes = await request(app)
      .post('/api/projects/v1/units')
      .set('Cookie', cookies)
      .send({ project_id: projRes.body.id, unit_code: 'COU01', name: 'CO Test Unit' });
    unitId = unitRes.body.id;
  }, 30000);

  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/projects/v1/change-orders');
    expect(res.status).toBe(401);
  });

  test('creates a change order', async () => {
    const res = await request(app)
      .post('/api/projects/v1/change-orders')
      .set('Cookie', cookies)
      .send({
        unit_id: unitId,
        co_number: 'CO-001',
        title: 'Foundation upgrade',
        reason: 'Soil conditions require deeper footing',
        total_amount: 15000,
      });

    expect(res.status).toBe(201);
    expect(res.body.co_number).toBe('CO-001');
    expect(res.body.status).toBe('draft');
    coId = res.body.id;
  });

  test('lists change orders', async () => {
    const res = await request(app).get('/api/projects/v1/change-orders').set('Cookie', cookies);
    expect(res.status).toBe(200);
    const rows = res.body.rows ?? res.body;
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('gets change order by id', async () => {
    const res = await request(app).get(`/api/projects/v1/change-orders/${coId}`).set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.co_number).toBe('CO-001');
  });

  test('updates a change order', async () => {
    const res = await request(app)
      .put(`/api/projects/v1/change-orders/update?id=${coId}`)
      .set('Cookie', cookies)
      .send({ total_amount: 18000 });

    expect(res.status).toBe(200);
  });

  test('archives a change order', async () => {
    const res = await request(app)
      .delete(`/api/projects/v1/change-orders/archive?id=${coId}`)
      .set('Cookie', cookies)
      .send({});

    expect(res.status).toBe(200);
  });

  test('restores an archived change order', async () => {
    const res = await request(app)
      .patch(`/api/projects/v1/change-orders/restore?id=${coId}`)
      .set('Cookie', cookies)
      .send({});

    expect(res.status).toBe(200);
  });
});
