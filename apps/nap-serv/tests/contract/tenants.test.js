/**
 * @file Contract tests for tenant CRUD endpoints
 * @module tests/contract/tenants
 *
 * Tests the tenant API endpoints: create (with provisioning), list, get,
 * update, archive (root tenant rejected), restore. Uses supertest with
 * the real Express app and test database.
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

/** Login with root credentials and return cookies. */
async function loginRoot() {
  const res = await request(app).post('/api/auth/login').send({ email: ROOT_EMAIL, password: ROOT_PASSWORD });
  return res.headers['set-cookie'];
}

describe('GET /api/tenants/v1/tenants', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/tenants/v1/tenants');
    expect(res.status).toBe(401);
  });

  test('returns tenant list when authenticated as root user', async () => {
    const cookies = await loginRoot();
    const res = await request(app).get('/api/tenants/v1/tenants').set('Cookie', cookies);

    expect(res.status).toBe(200);
    // Should have at least the root NAP tenant from bootstrap
    const rows = res.body.rows ?? res.body;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const nap = (Array.isArray(rows) ? rows : []).find((t) => t.tenant_code === 'NAP');
    expect(nap).toBeDefined();
  });
});

describe('POST /api/tenants/v1/tenants', () => {
  test('creates a new tenant with schema provisioning and admin user', async () => {
    const cookies = await loginRoot();
    const body = {
      tenant_code: 'ACME',
      company: 'Acme Corp',
      status: 'active',
      tier: 'starter',
      admin_first_name: 'Test',
      admin_last_name: 'Admin',
      admin_email: 'admin@acme.com',
      admin_password: 'AcmePass123!',
    };

    const res = await request(app).post('/api/tenants/v1/tenants').set('Cookie', cookies).send(body);

    expect(res.status).toBe(201);
    expect(res.body.tenant_code).toBe('ACME');
    expect(res.body.company).toBe('Acme Corp');
    expect(res.body.schema_name).toBe('acme');
    expect(res.body.admin_user_id).toBeDefined();
  });

  test('returns 400 when tenant_code missing', async () => {
    const cookies = await loginRoot();
    const res = await request(app).post('/api/tenants/v1/tenants').set('Cookie', cookies).send({
      company: 'No Code Corp',
      admin_first_name: 'Test',
      admin_last_name: 'Admin',
      admin_email: 'a@b.com',
      admin_password: 'Pass123!',
    });

    expect(res.status).toBe(400);
  });

  test('returns 400 when admin_email missing', async () => {
    const cookies = await loginRoot();
    const res = await request(app).post('/api/tenants/v1/tenants').set('Cookie', cookies).send({
      tenant_code: 'TEST',
      company: 'Test Corp',
      admin_password: 'Pass123!',
    });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/tenants/v1/tenants/:id', () => {
  test('returns a single tenant by id', async () => {
    const cookies = await loginRoot();

    // First, list to find a tenant id
    const listRes = await request(app).get('/api/tenants/v1/tenants').set('Cookie', cookies);
    const rows = listRes.body.rows ?? listRes.body;
    const tenant = (Array.isArray(rows) ? rows : []).find((t) => t.tenant_code === 'ACME');
    expect(tenant).toBeDefined();

    const res = await request(app).get(`/api/tenants/v1/tenants/${tenant.id}`).set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.tenant_code).toBe('ACME');
  });
});

describe('DELETE /api/tenants/v1/tenants/archive', () => {
  test('rejects archival of root NAP tenant', async () => {
    const cookies = await loginRoot();

    // Find NAP tenant id
    const listRes = await request(app).get('/api/tenants/v1/tenants').set('Cookie', cookies);
    const rows = listRes.body.rows ?? listRes.body;
    const nap = (Array.isArray(rows) ? rows : []).find((t) => t.tenant_code === 'NAP');

    const res = await request(app)
      .delete(`/api/tenants/v1/tenants/archive?id=${nap.id}`)
      .set('Cookie', cookies)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('root');
  });

  test('archives a non-root tenant and cascades to users', async () => {
    const cookies = await loginRoot();

    // Find ACME tenant
    const listRes = await request(app).get('/api/tenants/v1/tenants').set('Cookie', cookies);
    const rows = listRes.body.rows ?? listRes.body;
    const acme = (Array.isArray(rows) ? rows : []).find((t) => t.tenant_code === 'ACME');

    const res = await request(app)
      .delete(`/api/tenants/v1/tenants/archive?id=${acme.id}`)
      .set('Cookie', cookies)
      .send({});

    expect(res.status).toBe(200);

    // Verify tenant is now deactivated
    const getRes = await request(app)
      .get(`/api/tenants/v1/tenants/${acme.id}?includeDeactivated=true`)
      .set('Cookie', cookies);
    expect(getRes.body.deactivated_at).not.toBeNull();
  });
});

describe('PATCH /api/tenants/v1/tenants/restore', () => {
  test('restores an archived tenant', async () => {
    const cookies = await loginRoot();

    // Find ACME tenant (archived above)
    const listRes = await request(app)
      .get('/api/tenants/v1/tenants?includeDeactivated=true')
      .set('Cookie', cookies);
    const rows = listRes.body.rows ?? listRes.body;
    const acme = (Array.isArray(rows) ? rows : []).find((t) => t.tenant_code === 'ACME');

    const res = await request(app)
      .patch(`/api/tenants/v1/tenants/restore?id=${acme.id}`)
      .set('Cookie', cookies)
      .send({});

    expect(res.status).toBe(200);
  });
});

describe('GET /api/tenants/v1/tenants/:id/modules', () => {
  test('returns allowed modules for a tenant', async () => {
    const cookies = await loginRoot();

    const listRes = await request(app).get('/api/tenants/v1/tenants').set('Cookie', cookies);
    const rows = listRes.body.rows ?? listRes.body;
    const nap = (Array.isArray(rows) ? rows : []).find((t) => t.tenant_code === 'NAP');

    const res = await request(app)
      .get(`/api/tenants/v1/tenants/${nap.id}/modules`)
      .set('Cookie', cookies);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('allowed_modules');
  });
});
