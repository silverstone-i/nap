/**
 * @file Contract tests for vendor CRUD endpoints
 * @module tests/contract/vendors
 *
 * Tests the vendor API: create (auto-source), list, getById, update,
 * archive, restore. Requires a provisioned tenant schema.
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

/** Create a tenant to get a provisioned schema for entity CRUD. */
async function provisionTenant(cookies) {
  const res = await request(app)
    .post('/api/tenants/v1/tenants')
    .set('Cookie', cookies)
    .send({
      tenant_code: 'VTEST',
      company: 'Vendor Test Corp',
      status: 'active',
      tier: 'starter',
      admin_email: 'admin@vtest.com',
      admin_password: 'VtestPass123!',
    });
  return res.body;
}

describe('Vendor CRUD — /api/core/v1/vendors', () => {
  let cookies;
  let vendorId;

  beforeAll(async () => {
    cookies = await loginRoot();
    await provisionTenant(cookies);

    // Login as the tenant admin to get tenant context
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@vtest.com', password: 'VtestPass123!' });
    cookies = loginRes.headers['set-cookie'];
  }, 30000);

  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/core/v1/vendors');
    expect(res.status).toBe(401);
  });

  test('creates a vendor with auto-source linkage', async () => {
    const res = await request(app)
      .post('/api/core/v1/vendors')
      .set('Cookie', cookies)
      .send({ name: 'Acme Supplies', code: 'ACME', tax_id: '12-3456789', payment_terms: 'Net 30' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Acme Supplies');
    expect(res.body.source_id).toBeDefined();
    vendorId = res.body.id;
  });

  test('lists vendors', async () => {
    const res = await request(app).get('/api/core/v1/vendors').set('Cookie', cookies);
    expect(res.status).toBe(200);
    const rows = res.body.rows ?? res.body;
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('gets vendor by id', async () => {
    const res = await request(app).get(`/api/core/v1/vendors/${vendorId}`).set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe('ACME');
  });

  test('updates a vendor', async () => {
    const res = await request(app)
      .put(`/api/core/v1/vendors/update?id=${vendorId}`)
      .set('Cookie', cookies)
      .send({ payment_terms: 'Net 60' });

    expect(res.status).toBe(200);
  });

  test('archives a vendor', async () => {
    const res = await request(app)
      .delete(`/api/core/v1/vendors/archive?id=${vendorId}`)
      .set('Cookie', cookies)
      .send({});

    expect(res.status).toBe(200);
  });

  test('restores an archived vendor', async () => {
    const res = await request(app)
      .patch(`/api/core/v1/vendors/restore?id=${vendorId}`)
      .set('Cookie', cookies)
      .send({});

    expect(res.status).toBe(200);
  });

  test('returns 409 for duplicate vendor code', async () => {
    const res = await request(app)
      .post('/api/core/v1/vendors')
      .set('Cookie', cookies)
      .send({ name: 'Duplicate', code: 'ACME' });

    expect(res.status).toBe(409);
  });
});
