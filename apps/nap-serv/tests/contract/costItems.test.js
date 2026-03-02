/**
 * @file Contract tests for cost item CRUD endpoints
 * @module tests/contract/costItems
 *
 * Tests cost items scoped to a task: create, list, getById, update,
 * verify generated `amount` column (quantity * unit_cost), archive, restore.
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
      tenant_code: 'CITEST',
      company: 'Cost Item Test Corp',
      status: 'active',
      tier: 'starter',
      admin_first_name: 'Test',
      admin_last_name: 'Admin',
      admin_email: 'admin@citest.com',
      admin_password: 'CitestPass123!',
    });
}

describe('Cost Item CRUD — /api/projects/v1/cost-items', () => {
  let cookies;
  let taskId;
  let costItemId;

  beforeAll(async () => {
    cookies = await loginRoot();
    await provisionTenant(cookies);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@citest.com', password: 'CitestPass123!' });
    cookies = loginRes.headers['set-cookie'];

    // Create inter-company → project → unit → task
    const icRes = await request(app)
      .post('/api/core/v1/inter-companies')
      .set('Cookie', cookies)
      .send({ code: 'CICO', name: 'CostItem Test Company' });

    const projRes = await request(app)
      .post('/api/projects/v1/projects')
      .set('Cookie', cookies)
      .send({ project_code: 'CIPRJ', name: 'CostItem Test Project', company_id: icRes.body.id });

    const unitRes = await request(app)
      .post('/api/projects/v1/units')
      .set('Cookie', cookies)
      .send({ project_id: projRes.body.id, unit_code: 'CIU01', name: 'CostItem Test Unit' });

    const taskRes = await request(app)
      .post('/api/projects/v1/tasks')
      .set('Cookie', cookies)
      .send({ unit_id: unitRes.body.id, task_code: 'CIT01', name: 'CostItem Test Task' });
    taskId = taskRes.body.id;
  }, 30000);

  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/projects/v1/cost-items');
    expect(res.status).toBe(401);
  });

  test('creates a cost item with computed amount', async () => {
    const res = await request(app)
      .post('/api/projects/v1/cost-items')
      .set('Cookie', cookies)
      .send({
        task_id: taskId,
        item_code: 'MAT01',
        description: 'Lumber',
        cost_class: 'material',
        cost_source: 'budget',
        quantity: 10,
        unit_cost: 25.5,
      });

    expect(res.status).toBe(201);
    expect(res.body.item_code).toBe('MAT01');
    // Generated column: amount = quantity * unit_cost = 10 * 25.50 = 255.00
    expect(Number(res.body.amount)).toBeCloseTo(255.0, 2);
    costItemId = res.body.id;
  });

  test('lists cost items', async () => {
    const res = await request(app).get('/api/projects/v1/cost-items').set('Cookie', cookies);
    expect(res.status).toBe(200);
    const rows = res.body.rows ?? res.body;
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('gets cost item by id', async () => {
    const res = await request(app).get(`/api/projects/v1/cost-items/${costItemId}`).set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.item_code).toBe('MAT01');
    expect(Number(res.body.amount)).toBeCloseTo(255.0, 2);
  });

  test('updates cost item and amount is recalculated', async () => {
    const res = await request(app)
      .put(`/api/projects/v1/cost-items/update?id=${costItemId}`)
      .set('Cookie', cookies)
      .send({ quantity: 20 });

    expect(res.status).toBe(200);

    // Verify recalculated amount via getById
    const getRes = await request(app).get(`/api/projects/v1/cost-items/${costItemId}`).set('Cookie', cookies);
    // New amount = 20 * 25.50 = 510.00
    expect(Number(getRes.body.amount)).toBeCloseTo(510.0, 2);
  });

  test('archives a cost item', async () => {
    const res = await request(app)
      .delete(`/api/projects/v1/cost-items/archive?id=${costItemId}`)
      .set('Cookie', cookies)
      .send({});

    expect(res.status).toBe(200);
  });

  test('restores an archived cost item', async () => {
    const res = await request(app)
      .patch(`/api/projects/v1/cost-items/restore?id=${costItemId}`)
      .set('Cookie', cookies)
      .send({});

    expect(res.status).toBe(200);
  });
});
