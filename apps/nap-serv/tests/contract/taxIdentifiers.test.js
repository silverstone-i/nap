/**
 * @file Contract tests for tax identifier CRUD endpoints
 * @module tests/contract/taxIdentifiers
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
      tenant_code: 'TXTEST',
      company: 'TaxId Test Corp',
      status: 'active',
      tier: 'starter',
      admin_first_name: 'Test',
      admin_last_name: 'Admin',
      admin_email: 'admin@txtest.com',
      admin_password: 'TxtestPass123!',
    });
}

describe('Tax Identifiers CRUD — /api/core/v1/tax-identifiers', () => {
  let cookies;
  let sourceId;
  let taxIdRecordId;

  beforeAll(async () => {
    const rootCookies = await loginRoot();
    await provisionTenant(rootCookies);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@txtest.com', password: 'TxtestPass123!' });
    cookies = loginRes.headers['set-cookie'];

    // Create a vendor to get a source_id
    const vendorRes = await request(app)
      .post('/api/core/v1/vendors')
      .set('Cookie', cookies)
      .send({ name: 'Tax Test Vendor', code: 'TTV01' });
    sourceId = vendorRes.body.source_id;
  }, 30000);

  test('creates a tax identifier', async () => {
    const res = await request(app)
      .post('/api/core/v1/tax-identifiers')
      .set('Cookie', cookies)
      .send({ source_id: sourceId, country_code: 'US', tax_type: 'EIN', tax_value: '12-3456789', is_primary: true });

    expect(res.status).toBe(201);
    expect(res.body.source_id).toBe(sourceId);
    expect(res.body.country_code).toBe('US');
    expect(res.body.tax_type).toBe('EIN');
    expect(res.body.tax_value).toBe('12-3456789');
    expect(res.body.is_primary).toBe(true);
    taxIdRecordId = res.body.id;
  });

  test('lists tax identifiers filtered by source_id', async () => {
    const res = await request(app)
      .get(`/api/core/v1/tax-identifiers?source_id=${sourceId}`)
      .set('Cookie', cookies);
    expect(res.status).toBe(200);
    const rows = res.body.rows ?? res.body;
    expect(rows.length).toBe(1);
    expect(rows[0].tax_value).toBe('12-3456789');
  });

  test('gets tax identifier by id', async () => {
    const res = await request(app)
      .get(`/api/core/v1/tax-identifiers/${taxIdRecordId}`)
      .set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.tax_type).toBe('EIN');
  });

  test('updates a tax identifier', async () => {
    const res = await request(app)
      .put(`/api/core/v1/tax-identifiers/update?id=${taxIdRecordId}`)
      .set('Cookie', cookies)
      .send({ tax_value: '98-7654321' });
    expect(res.status).toBe(200);
  });

  test('rejects duplicate (source_id, country_code, tax_type)', async () => {
    const res = await request(app)
      .post('/api/core/v1/tax-identifiers')
      .set('Cookie', cookies)
      .send({ source_id: sourceId, country_code: 'US', tax_type: 'EIN', tax_value: '00-0000000', is_primary: false });

    expect(res.status).toBe(409);
  });

  test('archives and restores a tax identifier', async () => {
    const archiveRes = await request(app)
      .delete(`/api/core/v1/tax-identifiers/archive?id=${taxIdRecordId}`)
      .set('Cookie', cookies)
      .send({});
    expect(archiveRes.status).toBe(200);

    const restoreRes = await request(app)
      .patch(`/api/core/v1/tax-identifiers/restore?id=${taxIdRecordId}`)
      .set('Cookie', cookies)
      .send({});
    expect(restoreRes.status).toBe(200);
  });
});
