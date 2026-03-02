/**
 * @file Contract tests for tasks master CRUD endpoints
 * @module tests/contract/tasksMaster
 *
 * Tests master task definitions: create (tenant_id injection),
 * list, getById, update, archive, restore, composite FK enforcement.
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
      tenant_code: 'TMTEST',
      company: 'Tasks Master Test Corp',
      status: 'active',
      tier: 'starter',
      admin_first_name: 'Test',
      admin_last_name: 'Admin',
      admin_email: 'admin@tmtest.com',
      admin_password: 'TmtestPass123!',
    });
}

describe('Tasks Master CRUD — /api/projects/v1/tasks-master', () => {
  let cookies;
  let tmId;

  beforeAll(async () => {
    cookies = await loginRoot();
    await provisionTenant(cookies);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@tmtest.com', password: 'TmtestPass123!' });
    cookies = loginRes.headers['set-cookie'];

    // Create a task group for the composite FK
    await request(app)
      .post('/api/projects/v1/task-groups')
      .set('Cookie', cookies)
      .send({ code: 'ELEC', name: 'Electrical' });
  }, 30000);

  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/projects/v1/tasks-master');
    expect(res.status).toBe(401);
  });

  test('creates a tasks master', async () => {
    const res = await request(app)
      .post('/api/projects/v1/tasks-master')
      .set('Cookie', cookies)
      .send({
        code: 'WIRE',
        task_group_code: 'ELEC',
        name: 'Rough Wiring',
        default_duration_days: 3,
      });

    expect(res.status).toBe(201);
    expect(res.body.code).toBe('WIRE');
    expect(res.body.task_group_code).toBe('ELEC');
    tmId = res.body.id;
  });

  test('lists tasks master', async () => {
    const res = await request(app).get('/api/projects/v1/tasks-master').set('Cookie', cookies);
    expect(res.status).toBe(200);
    const rows = res.body.rows ?? res.body;
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('gets tasks master by id', async () => {
    const res = await request(app).get(`/api/projects/v1/tasks-master/${tmId}`).set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe('WIRE');
  });

  test('updates a tasks master', async () => {
    const res = await request(app)
      .put(`/api/projects/v1/tasks-master/update?id=${tmId}`)
      .set('Cookie', cookies)
      .send({ default_duration_days: 5 });

    expect(res.status).toBe(200);
  });

  test('rejects tasks master with invalid task_group_code', async () => {
    const res = await request(app)
      .post('/api/projects/v1/tasks-master')
      .set('Cookie', cookies)
      .send({
        code: 'BAD01',
        task_group_code: 'NONEXIST',
        name: 'Should Fail',
      });

    // The composite FK should reject this — expect a server error or FK violation
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test('archives a tasks master', async () => {
    const res = await request(app)
      .delete(`/api/projects/v1/tasks-master/archive?id=${tmId}`)
      .set('Cookie', cookies)
      .send({});

    expect(res.status).toBe(200);
  });

  test('restores an archived tasks master', async () => {
    const res = await request(app)
      .patch(`/api/projects/v1/tasks-master/restore?id=${tmId}`)
      .set('Cookie', cookies)
      .send({});

    expect(res.status).toBe(200);
  });
});
