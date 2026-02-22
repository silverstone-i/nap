/**
 * @file Integration test — user registration: register → login → verify
 * @module tests/integration/userRegistration
 *
 * Verifies end-to-end user registration flow: register a user on the
 * root tenant, verify they can log in and access /me, and that
 * password_hash is never exposed.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { bootstrapAdmin, cleanupTestDb } from '../helpers/testDb.js';

const ROOT_EMAIL = process.env.ROOT_EMAIL;
const ROOT_PASSWORD = process.env.ROOT_PASSWORD;
const ROOT_TENANT_CODE = process.env.ROOT_TENANT_CODE || 'NAP';

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

describe('User registration lifecycle — register → login → verify', () => {
  const TEST_EMAIL = 'integ-test@napsoft.com';
  const TEST_PASSWORD = 'IntegTest123!';

  test('1. Register user via admin endpoint', async () => {
    const cookies = await loginRoot();

    const res = await request(app)
      .post('/api/tenants/v1/nap-users/register')
      .set('Cookie', cookies)
      .send({
        tenant_code: ROOT_TENANT_CODE,
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(TEST_EMAIL);
    expect(res.body.user.status).toBe('active');
    expect(res.body.user.password_hash).toBeUndefined();
  });

  test('2. New user can log in', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Logged in successfully');
  });

  test('3. New user can access /me', async () => {
    // Login the new user
    const loginRes = await request(app).post('/api/auth/login').send({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    const cookies = loginRes.headers['set-cookie'];

    const meRes = await request(app).get('/api/auth/me').set('Cookie', cookies);

    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe(TEST_EMAIL);
    expect(meRes.body.user.password_hash).toBeUndefined();
  });

  test('4. Archive user prevents login', async () => {
    const adminCookies = await loginRoot();

    // Find the test user
    const listRes = await request(app).get('/api/tenants/v1/nap-users').set('Cookie', adminCookies);
    const rows = listRes.body.rows ?? listRes.body;
    const target = (Array.isArray(rows) ? rows : []).find((u) => u.email === TEST_EMAIL);
    expect(target).toBeDefined();

    // Archive the user
    const archiveRes = await request(app)
      .delete(`/api/tenants/v1/nap-users/archive?id=${target.id}`)
      .set('Cookie', adminCookies)
      .send({});

    expect(archiveRes.status).toBe(200);

    // Verify user cannot log in
    const loginRes = await request(app).post('/api/auth/login').send({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    expect(loginRes.status).toBeGreaterThanOrEqual(400);
  });

  test('5. Restore user re-enables login', async () => {
    const adminCookies = await loginRoot();

    // Find the archived test user
    const listRes = await request(app)
      .get('/api/tenants/v1/nap-users?includeDeactivated=true')
      .set('Cookie', adminCookies);
    const rows = listRes.body.rows ?? listRes.body;
    const target = (Array.isArray(rows) ? rows : []).find((u) => u.email === TEST_EMAIL);

    // Restore
    const restoreRes = await request(app)
      .patch(`/api/tenants/v1/nap-users/restore?id=${target.id}`)
      .set('Cookie', adminCookies)
      .send({});

    expect(restoreRes.status).toBe(200);

    // Verify user can log in again
    const loginRes = await request(app).post('/api/auth/login').send({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    expect(loginRes.status).toBe(200);
  });
});
