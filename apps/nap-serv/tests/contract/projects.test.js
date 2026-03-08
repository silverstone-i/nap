/**
 * @file Contract tests for project CRUD endpoints
 * @module tests/contract/projects
 *
 * Tests the projects API: create (tenant_id injection), list, getById,
 * update, status transitions (valid + invalid), archive, restore, duplicate code.
 * Requires a provisioned tenant schema with an inter_company for company_id FK.
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
      tenant_code: 'PTEST',
      company: 'Project Test Corp',
      status: 'active',
      tier: 'starter',
      admin_first_name: 'Test',
      admin_last_name: 'Admin',
      admin_email: 'admin@ptest.com',
      admin_password: 'PtestPass123!',
    });
}

describe('Project CRUD — /api/projects/v1/projects', () => {
  let cookies;
  let projectId;
  let companyId;

  beforeAll(async () => {
    cookies = await loginRoot();
    await provisionTenant(cookies);

    // Login as tenant admin
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@ptest.com', password: 'PtestPass123!' });
    cookies = loginRes.headers['set-cookie'];

    // Create an inter-company for the company_id FK
    const icRes = await request(app)
      .post('/api/core/v1/inter-companies')
      .set('Cookie', cookies)
      .send({ code: 'PTCO', name: 'Project Test Company', tax_id: '11-2223333' });
    companyId = icRes.body.id;
  }, 30000);

  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/projects/v1/projects');
    expect(res.status).toBe(401);
  });

  test('creates a project', async () => {
    const res = await request(app)
      .post('/api/projects/v1/projects')
      .set('Cookie', cookies)
      .send({
        project_code: 'PRJ001',
        name: 'Test Project Alpha',
        company_id: companyId,
        contract_amount: 100000,
      });

    expect(res.status).toBe(201);
    expect(res.body.project_code).toBe('PRJ001');
    expect(res.body.name).toBe('Test Project Alpha');
    expect(res.body.status).toBe('planning');
    projectId = res.body.id;
  });

  test('lists projects', async () => {
    const res = await request(app).get('/api/projects/v1/projects').set('Cookie', cookies);
    expect(res.status).toBe(200);
    const rows = res.body.rows ?? res.body;
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('gets project by id', async () => {
    const res = await request(app).get(`/api/projects/v1/projects/${projectId}`).set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.project_code).toBe('PRJ001');
  });

  test('updates a project', async () => {
    const res = await request(app)
      .put(`/api/projects/v1/projects/update?id=${projectId}`)
      .set('Cookie', cookies)
      .send({ name: 'Test Project Alpha Updated' });

    expect(res.status).toBe(200);
  });

  test('allows valid status transition planning → budgeting', async () => {
    const res = await request(app)
      .put(`/api/projects/v1/projects/update?id=${projectId}`)
      .set('Cookie', cookies)
      .send({ status: 'budgeting' });

    expect(res.status).toBe(200);
  });

  test('rejects invalid status transition budgeting → complete', async () => {
    const res = await request(app)
      .put(`/api/projects/v1/projects/update?id=${projectId}`)
      .set('Cookie', cookies)
      .send({ status: 'complete' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid status transition');
    expect(res.body.allowed).toEqual(['released']);
  });

  test('archives a project', async () => {
    const res = await request(app)
      .delete(`/api/projects/v1/projects/archive?id=${projectId}`)
      .set('Cookie', cookies)
      .send({});

    expect(res.status).toBe(200);
  });

  test('restores an archived project', async () => {
    const res = await request(app)
      .patch(`/api/projects/v1/projects/restore?id=${projectId}`)
      .set('Cookie', cookies)
      .send({});

    expect(res.status).toBe(200);
  });

  test('returns 409 for duplicate project_code', async () => {
    const res = await request(app)
      .post('/api/projects/v1/projects')
      .set('Cookie', cookies)
      .send({ project_code: 'PRJ001', name: 'Duplicate', company_id: companyId });

    expect(res.status).toBe(409);
  });
});
