/**
 * @file Contract tests for task CRUD endpoints
 * @module tests/contract/tasks
 *
 * Tests tasks scoped to a unit: create, list, getById, update,
 * parent_task_id self-ref, archive, restore.
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
      tenant_code: 'TKTEST',
      company: 'Task Test Corp',
      status: 'active',
      tier: 'starter',
      admin_first_name: 'Test',
      admin_last_name: 'Admin',
      admin_email: 'admin@tktest.com',
      admin_password: 'TktestPass123!',
    });
}

describe('Task CRUD — /api/projects/v1/tasks', () => {
  let cookies;
  let unitId;
  let taskId;
  let childTaskId;

  beforeAll(async () => {
    cookies = await loginRoot();
    await provisionTenant(cookies);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@tktest.com', password: 'TktestPass123!' });
    cookies = loginRes.headers['set-cookie'];

    // Create inter-company → project → unit
    const icRes = await request(app)
      .post('/api/core/v1/inter-companies')
      .set('Cookie', cookies)
      .send({ code: 'TKCO', name: 'Task Test Company' });

    const projRes = await request(app)
      .post('/api/projects/v1/projects')
      .set('Cookie', cookies)
      .send({ project_code: 'TKPRJ', name: 'Task Test Project', company_id: icRes.body.id });

    const unitRes = await request(app)
      .post('/api/projects/v1/units')
      .set('Cookie', cookies)
      .send({ project_id: projRes.body.id, unit_code: 'TU01', name: 'Task Test Unit' });
    unitId = unitRes.body.id;
  }, 30000);

  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/projects/v1/tasks');
    expect(res.status).toBe(401);
  });

  test('creates a task', async () => {
    const res = await request(app)
      .post('/api/projects/v1/tasks')
      .set('Cookie', cookies)
      .send({ unit_id: unitId, task_code: 'T001', name: 'Framing', duration_days: 5 });

    expect(res.status).toBe(201);
    expect(res.body.task_code).toBe('T001');
    expect(res.body.status).toBe('pending');
    taskId = res.body.id;
  });

  test('creates a child task with parent_task_id', async () => {
    const res = await request(app)
      .post('/api/projects/v1/tasks')
      .set('Cookie', cookies)
      .send({ unit_id: unitId, task_code: 'T001A', name: 'Framing - Sub', parent_task_id: taskId });

    expect(res.status).toBe(201);
    expect(res.body.parent_task_id).toBe(taskId);
    childTaskId = res.body.id;
  });

  test('lists tasks', async () => {
    const res = await request(app).get('/api/projects/v1/tasks').set('Cookie', cookies);
    expect(res.status).toBe(200);
    const rows = res.body.rows ?? res.body;
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  test('gets task by id', async () => {
    const res = await request(app).get(`/api/projects/v1/tasks/${taskId}`).set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.task_code).toBe('T001');
  });

  test('updates a task', async () => {
    const res = await request(app)
      .put(`/api/projects/v1/tasks/update?id=${taskId}`)
      .set('Cookie', cookies)
      .send({ duration_days: 10 });

    expect(res.status).toBe(200);
  });

  test('archives child task first', async () => {
    const res = await request(app)
      .delete(`/api/projects/v1/tasks/archive?id=${childTaskId}`)
      .set('Cookie', cookies)
      .send({});

    expect(res.status).toBe(200);
  });

  test('archives parent task', async () => {
    const res = await request(app)
      .delete(`/api/projects/v1/tasks/archive?id=${taskId}`)
      .set('Cookie', cookies)
      .send({});

    expect(res.status).toBe(200);
  });

  test('restores parent task', async () => {
    const res = await request(app)
      .patch(`/api/projects/v1/tasks/restore?id=${taskId}`)
      .set('Cookie', cookies)
      .send({});

    expect(res.status).toBe(200);
  });
});
