/**
 * @file Contract tests for inter-company CRUD endpoints
 * @module tests/contract/interCompanies
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
      tenant_code: 'ICTEST',
      company: 'InterCo Test Corp',
      status: 'active',
      tier: 'starter',
      admin_first_name: 'Test',
      admin_last_name: 'Admin',
      admin_email: 'admin@ictest.com',
      admin_password: 'IctestPass123!',
    });
}

describe('Inter-Company CRUD — /api/core/v1/inter-companies', () => {
  let cookies;
  let icId;

  beforeAll(async () => {
    const rootCookies = await loginRoot();
    await provisionTenant(rootCookies);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@ictest.com', password: 'IctestPass123!' });
    cookies = loginRes.headers['set-cookie'];
  }, 30000);

  test('creates an inter-company', async () => {
    const res = await request(app)
      .post('/api/core/v1/inter-companies')
      .set('Cookie', cookies)
      .send({ code: 'SUB01', name: 'Subsidiary One', tax_id: '99-7654321' });

    expect(res.status).toBe(201);
    expect(res.body.code).toBe('SUB01');
    expect(res.body.name).toBe('Subsidiary One');
    icId = res.body.id;
  });

  test('lists inter-companies', async () => {
    const res = await request(app).get('/api/core/v1/inter-companies').set('Cookie', cookies);
    expect(res.status).toBe(200);
    const rows = res.body.rows ?? res.body;
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('gets inter-company by id', async () => {
    const res = await request(app).get(`/api/core/v1/inter-companies/${icId}`).set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe('SUB01');
  });

  test('returns 409 for duplicate code', async () => {
    const res = await request(app)
      .post('/api/core/v1/inter-companies')
      .set('Cookie', cookies)
      .send({ code: 'SUB01', name: 'Duplicate' });

    expect(res.status).toBe(409);
  });

  test('archives and restores an inter-company', async () => {
    const archiveRes = await request(app)
      .delete(`/api/core/v1/inter-companies/archive?id=${icId}`)
      .set('Cookie', cookies)
      .send({});
    expect(archiveRes.status).toBe(200);

    const restoreRes = await request(app)
      .patch(`/api/core/v1/inter-companies/restore?id=${icId}`)
      .set('Cookie', cookies)
      .send({});
    expect(restoreRes.status).toBe(200);
  });
});
