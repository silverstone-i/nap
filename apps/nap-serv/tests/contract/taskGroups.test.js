/**
 * @file Contract tests for task group CRUD endpoints
 * @module tests/contract/taskGroups
 *
 * Tests tenant-level task groups: create (tenant_id injection),
 * list, getById, update, archive, restore, duplicate code.
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
      tenant_code: 'TGTEST',
      company: 'Task Group Test Corp',
      status: 'active',
      tier: 'starter',
      admin_first_name: 'Test',
      admin_last_name: 'Admin',
      admin_email: 'admin@tgtest.com',
      admin_password: 'TgtestPass123!',
    });
}

describe('Task Group CRUD — /api/projects/v1/task-groups', () => {
  let cookies;
  let tgId;

  beforeAll(async () => {
    cookies = await loginRoot();
    await provisionTenant(cookies);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@tgtest.com', password: 'TgtestPass123!' });
    cookies = loginRes.headers['set-cookie'];
  }, 30000);

  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/projects/v1/task-groups');
    expect(res.status).toBe(401);
  });

  test('creates a task group', async () => {
    const res = await request(app)
      .post('/api/projects/v1/task-groups')
      .set('Cookie', cookies)
      .send({ code: 'FRAME', name: 'Framing', description: 'Wood framing tasks', sort_order: 1 });

    expect(res.status).toBe(201);
    expect(res.body.code).toBe('FRAME');
    expect(res.body.name).toBe('Framing');
    tgId = res.body.id;
  });

  test('lists task groups', async () => {
    const res = await request(app).get('/api/projects/v1/task-groups').set('Cookie', cookies);
    expect(res.status).toBe(200);
    const rows = res.body.rows ?? res.body;
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('gets task group by id', async () => {
    const res = await request(app).get(`/api/projects/v1/task-groups/${tgId}`).set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe('FRAME');
  });

  test('updates a task group', async () => {
    const res = await request(app)
      .put(`/api/projects/v1/task-groups/update?id=${tgId}`)
      .set('Cookie', cookies)
      .send({ sort_order: 10 });

    expect(res.status).toBe(200);
  });

  test('archives a task group', async () => {
    const res = await request(app)
      .delete(`/api/projects/v1/task-groups/archive?id=${tgId}`)
      .set('Cookie', cookies)
      .send({});

    expect(res.status).toBe(200);
  });

  test('restores an archived task group', async () => {
    const res = await request(app)
      .patch(`/api/projects/v1/task-groups/restore?id=${tgId}`)
      .set('Cookie', cookies)
      .send({});

    expect(res.status).toBe(200);
  });

  test('returns 409 for duplicate task group code', async () => {
    const res = await request(app)
      .post('/api/projects/v1/task-groups')
      .set('Cookie', cookies)
      .send({ code: 'FRAME', name: 'Duplicate' });

    expect(res.status).toBe(409);
  });
});
