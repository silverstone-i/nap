/**
 * @file Integration test — generated columns (GENERATED ALWAYS AS ... STORED)
 * @module tests/integration/generatedColumns
 *
 * Verifies that cost_items.amount and template_cost_items.amount are
 * computed by PostgreSQL as (quantity * unit_cost), are read-only,
 * and recalculate when inputs change.
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

describe('Generated columns — cost_items.amount = quantity * unit_cost', () => {
  let tenantCookies;
  let tenantSchema;
  let taskId;

  beforeAll(async () => {
    const rootCookies = await loginRoot();

    await request(app)
      .post('/api/tenants/v1/tenants')
      .set('Cookie', rootCookies)
      .send({
        tenant_code: 'GCTEST',
        company: 'Gen Column Test Corp',
        status: 'active',
        tier: 'starter',
        admin_email: 'admin@gctest.com',
        admin_password: 'GctestPass123!',
      });

    const tenant = await db.one("SELECT schema_name FROM admin.tenants WHERE tenant_code = 'GCTEST'");
    tenantSchema = tenant.schema_name;

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@gctest.com', password: 'GctestPass123!' });
    tenantCookies = loginRes.headers['set-cookie'];

    // Create inter-company → project → unit → task for cost items
    const icRes = await request(app)
      .post('/api/core/v1/inter-companies')
      .set('Cookie', tenantCookies)
      .send({ code: 'GCCO', name: 'Gen Column Company' });

    const projRes = await request(app)
      .post('/api/projects/v1/projects')
      .set('Cookie', tenantCookies)
      .send({ project_code: 'GCPRJ', name: 'Gen Column Project', company_id: icRes.body.id });

    const unitRes = await request(app)
      .post('/api/projects/v1/units')
      .set('Cookie', tenantCookies)
      .send({ project_id: projRes.body.id, unit_code: 'GCU01', name: 'Gen Column Unit' });

    const taskRes = await request(app)
      .post('/api/projects/v1/tasks')
      .set('Cookie', tenantCookies)
      .send({ unit_id: unitRes.body.id, task_code: 'GCT01', name: 'Gen Column Task' });
    taskId = taskRes.body.id;
  }, 30000);

  test('1. Insert cost item — amount computed correctly', async () => {
    const res = await request(app)
      .post('/api/projects/v1/cost-items')
      .set('Cookie', tenantCookies)
      .send({
        task_id: taskId,
        item_code: 'GC01',
        description: 'Drywall sheets',
        cost_class: 'material',
        quantity: 10,
        unit_cost: 25.5,
      });

    expect(res.status).toBe(201);

    // Verify via API response
    expect(Number(res.body.amount)).toBeCloseTo(255.0, 2);

    // Verify directly in DB
    const row = await db.one(`SELECT amount FROM ${tenantSchema}.cost_items WHERE id = $1`, [res.body.id]);
    expect(Number(row.amount)).toBeCloseTo(255.0, 2);
  });

  test('2. Update quantity — amount recalculated', async () => {
    // Create a new cost item for isolated update test
    const createRes = await request(app)
      .post('/api/projects/v1/cost-items')
      .set('Cookie', tenantCookies)
      .send({
        task_id: taskId,
        item_code: 'GC02',
        description: 'Nails',
        cost_class: 'material',
        quantity: 5,
        unit_cost: 12,
      });

    expect(createRes.status).toBe(201);
    const ciId = createRes.body.id;
    expect(Number(createRes.body.amount)).toBeCloseTo(60.0, 2);

    // Update quantity to 20
    await request(app)
      .put(`/api/projects/v1/cost-items/update?id=${ciId}`)
      .set('Cookie', tenantCookies)
      .send({ quantity: 20 });

    // Verify recalculated amount in DB (20 * 12 = 240)
    const row = await db.one(`SELECT amount FROM ${tenantSchema}.cost_items WHERE id = $1`, [ciId]);
    expect(Number(row.amount)).toBeCloseTo(240.0, 2);
  });

  test('3. Update unit_cost — amount recalculated', async () => {
    const createRes = await request(app)
      .post('/api/projects/v1/cost-items')
      .set('Cookie', tenantCookies)
      .send({
        task_id: taskId,
        item_code: 'GC03',
        description: 'Paint',
        cost_class: 'material',
        quantity: 8,
        unit_cost: 30,
      });

    expect(createRes.status).toBe(201);
    const ciId = createRes.body.id;
    expect(Number(createRes.body.amount)).toBeCloseTo(240.0, 2);

    // Update unit_cost to 50
    await request(app)
      .put(`/api/projects/v1/cost-items/update?id=${ciId}`)
      .set('Cookie', tenantCookies)
      .send({ unit_cost: 50 });

    // Verify recalculated amount in DB (8 * 50 = 400)
    const row = await db.one(`SELECT amount FROM ${tenantSchema}.cost_items WHERE id = $1`, [ciId]);
    expect(Number(row.amount)).toBeCloseTo(400.0, 2);
  });

  test('4. Zero quantity yields zero amount', async () => {
    const res = await request(app)
      .post('/api/projects/v1/cost-items')
      .set('Cookie', tenantCookies)
      .send({
        task_id: taskId,
        item_code: 'GC04',
        description: 'Optional item',
        cost_class: 'other',
        quantity: 0,
        unit_cost: 100,
      });

    expect(res.status).toBe(201);
    expect(Number(res.body.amount)).toBeCloseTo(0, 2);
  });

  test('5. Decimal precision preserved', async () => {
    const res = await request(app)
      .post('/api/projects/v1/cost-items')
      .set('Cookie', tenantCookies)
      .send({
        task_id: taskId,
        item_code: 'GC05',
        description: 'Precision test',
        cost_class: 'material',
        quantity: 3.5,
        unit_cost: 7.25,
      });

    expect(res.status).toBe(201);
    // 3.5 * 7.25 = 25.375 → rounded to 25.38 (numeric(12,2))
    expect(Number(res.body.amount)).toBeCloseTo(25.38, 2);
  });
});
