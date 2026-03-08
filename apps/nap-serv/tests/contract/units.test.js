/**
 * @file Contract tests for unit CRUD endpoints
 * @module tests/contract/units
 *
 * Tests units scoped to a project: create, list, getById, update,
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
      tenant_code: 'UTEST',
      company: 'Unit Test Corp',
      status: 'active',
      tier: 'starter',
      admin_first_name: 'Test',
      admin_last_name: 'Admin',
      admin_email: 'admin@utest.com',
      admin_password: 'UtestPass123!',
    });
}

describe('Unit CRUD — /api/projects/v1/units', () => {
  let cookies;
  let projectId;
  let unitId;

  beforeAll(async () => {
    cookies = await loginRoot();
    await provisionTenant(cookies);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@utest.com', password: 'UtestPass123!' });
    cookies = loginRes.headers['set-cookie'];

    // Create inter-company + project for unit FK
    const icRes = await request(app)
      .post('/api/core/v1/inter-companies')
      .set('Cookie', cookies)
      .send({ code: 'UTCO', name: 'Unit Test Company' });

    const projRes = await request(app)
      .post('/api/projects/v1/projects')
      .set('Cookie', cookies)
      .send({ project_code: 'UPRJ', name: 'Unit Test Project', company_id: icRes.body.id });
    projectId = projRes.body.id;
  }, 30000);

  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/projects/v1/units');
    expect(res.status).toBe(401);
  });

  test('creates a unit', async () => {
    const res = await request(app)
      .post('/api/projects/v1/units')
      .set('Cookie', cookies)
      .send({ project_id: projectId, unit_code: 'U001', name: 'Unit Alpha' });

    expect(res.status).toBe(201);
    expect(res.body.unit_code).toBe('U001');
    expect(res.body.status).toBe('draft');
    unitId = res.body.id;
  });

  test('lists units', async () => {
    const res = await request(app).get('/api/projects/v1/units').set('Cookie', cookies);
    expect(res.status).toBe(200);
    const rows = res.body.rows ?? res.body;
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('gets unit by id', async () => {
    const res = await request(app).get(`/api/projects/v1/units/${unitId}`).set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.unit_code).toBe('U001');
  });

  test('updates a unit', async () => {
    const res = await request(app)
      .put(`/api/projects/v1/units/update?id=${unitId}`)
      .set('Cookie', cookies)
      .send({ name: 'Unit Alpha Updated' });

    expect(res.status).toBe(200);
  });

  test('archives a unit', async () => {
    const res = await request(app)
      .delete(`/api/projects/v1/units/archive?id=${unitId}`)
      .set('Cookie', cookies)
      .send({});

    expect(res.status).toBe(200);
  });

  test('restores an archived unit', async () => {
    const res = await request(app)
      .patch(`/api/projects/v1/units/restore?id=${unitId}`)
      .set('Cookie', cookies)
      .send({});

    expect(res.status).toBe(200);
  });
});
