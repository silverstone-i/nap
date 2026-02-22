/**
 * @file Contract tests for admin endpoints — schemas, impersonation
 * @module tests/contract/admin
 *
 * Tests admin schema listing and impersonation start/stop/status.
 * Requires Redis — tests that call Redis will be skipped if unavailable.
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

describe('GET /api/tenants/v1/admin/schemas', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/tenants/v1/admin/schemas');
    expect(res.status).toBe(401);
  });

  test('returns active tenant schemas for NapSoft user', async () => {
    const cookies = await loginRoot();
    const res = await request(app).get('/api/tenants/v1/admin/schemas').set('Cookie', cookies);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);

    // Check whitelisted columns only
    const first = res.body[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('tenant_code');
    expect(first).toHaveProperty('schema_name');
    expect(first).toHaveProperty('company');
    expect(first).toHaveProperty('status');
  });
});

describe('POST /api/tenants/v1/admin/impersonate', () => {
  test('returns 400 without target_user_id', async () => {
    const cookies = await loginRoot();
    const res = await request(app)
      .post('/api/tenants/v1/admin/impersonate')
      .set('Cookie', cookies)
      .send({});

    expect(res.status).toBe(400);
  });

  test('returns 404 for nonexistent target user', async () => {
    const cookies = await loginRoot();
    const res = await request(app)
      .post('/api/tenants/v1/admin/impersonate')
      .set('Cookie', cookies)
      .send({ target_user_id: '00000000-0000-0000-0000-000000000000' });

    expect(res.status).toBe(404);
  });
});

describe('GET /api/tenants/v1/admin/impersonation-status', () => {
  test('returns inactive status when not impersonating', async () => {
    const cookies = await loginRoot();
    const res = await request(app)
      .get('/api/tenants/v1/admin/impersonation-status')
      .set('Cookie', cookies);

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
  });
});

describe('POST /api/tenants/v1/admin/exit-impersonation', () => {
  test('returns success even when not impersonating', async () => {
    const cookies = await loginRoot();
    const res = await request(app)
      .post('/api/tenants/v1/admin/exit-impersonation')
      .set('Cookie', cookies);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('No active');
  });
});
