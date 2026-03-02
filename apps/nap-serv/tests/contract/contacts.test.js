/**
 * @file Contract tests for contact CRUD endpoints
 * @module tests/contract/contacts
 *
 * Contacts are linked to entities via source_id from the sources table.
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
      tenant_code: 'COTEST',
      company: 'Contact Test Corp',
      status: 'active',
      tier: 'starter',
      admin_first_name: 'Test',
      admin_last_name: 'Admin',
      admin_email: 'admin@cotest.com',
      admin_password: 'CotestPass123!',
    });
}

describe('Contact CRUD — /api/core/v1/contacts', () => {
  let cookies;
  let sourceId;
  let contactId;

  beforeAll(async () => {
    const rootCookies = await loginRoot();
    await provisionTenant(rootCookies);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@cotest.com', password: 'CotestPass123!' });
    cookies = loginRes.headers['set-cookie'];

    // Create a vendor to get a source_id for contacts
    const vendorRes = await request(app)
      .post('/api/core/v1/vendors')
      .set('Cookie', cookies)
      .send({ name: 'Source Vendor', code: 'SV01' });
    sourceId = vendorRes.body.source_id;
  }, 30000);

  test('creates a contact linked to a source', async () => {
    const res = await request(app)
      .post('/api/core/v1/contacts')
      .set('Cookie', cookies)
      .send({
        source_id: sourceId,
        name: 'John Doe',
        email: 'john@example.com',
        phone: '555-1234',
        position: 'Sales Manager',
        is_primary: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('John Doe');
    expect(res.body.source_id).toBe(sourceId);
    contactId = res.body.id;
  });

  test('lists contacts', async () => {
    const res = await request(app).get('/api/core/v1/contacts').set('Cookie', cookies);
    expect(res.status).toBe(200);
    const rows = res.body.rows ?? res.body;
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('gets contact by id', async () => {
    const res = await request(app).get(`/api/core/v1/contacts/${contactId}`).set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('john@example.com');
  });

  test('archives and restores a contact', async () => {
    const archiveRes = await request(app)
      .delete(`/api/core/v1/contacts/archive?id=${contactId}`)
      .set('Cookie', cookies)
      .send({});
    expect(archiveRes.status).toBe(200);

    const restoreRes = await request(app)
      .patch(`/api/core/v1/contacts/restore?id=${contactId}`)
      .set('Cookie', cookies)
      .send({});
    expect(restoreRes.status).toBe(200);
  });
});
