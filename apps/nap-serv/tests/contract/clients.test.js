/**
 * @file Contract tests for client CRUD endpoints
 * @module tests/contract/clients
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
      tenant_code: 'CTEST',
      company: 'Client Test Corp',
      status: 'active',
      tier: 'starter',
      admin_first_name: 'Test',
      admin_last_name: 'Admin',
      admin_email: 'admin@ctest.com',
      admin_password: 'CtestPass123!',
    });
}

describe('Client CRUD — /api/core/v1/clients', () => {
  let cookies;
  let clientId;

  beforeAll(async () => {
    const rootCookies = await loginRoot();
    await provisionTenant(rootCookies);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@ctest.com', password: 'CtestPass123!' });
    cookies = loginRes.headers['set-cookie'];
  }, 30000);

  test('creates a client with auto-source linkage', async () => {
    const res = await request(app)
      .post('/api/core/v1/clients')
      .set('Cookie', cookies)
      .send({ name: 'Big Corp', code: 'BIGCO' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Big Corp');
    expect(res.body.source_id).toBeDefined();
    clientId = res.body.id;
  });

  test('lists clients', async () => {
    const res = await request(app).get('/api/core/v1/clients').set('Cookie', cookies);
    expect(res.status).toBe(200);
    const rows = res.body.rows ?? res.body;
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('gets client by id', async () => {
    const res = await request(app).get(`/api/core/v1/clients/${clientId}`).set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe('BIGCO');
  });

  test('archives and restores a client', async () => {
    const archiveRes = await request(app)
      .delete(`/api/core/v1/clients/archive?id=${clientId}`)
      .set('Cookie', cookies)
      .send({});
    expect(archiveRes.status).toBe(200);

    const restoreRes = await request(app)
      .patch(`/api/core/v1/clients/restore?id=${clientId}`)
      .set('Cookie', cookies)
      .send({});
    expect(restoreRes.status).toBe(200);
  });
});
