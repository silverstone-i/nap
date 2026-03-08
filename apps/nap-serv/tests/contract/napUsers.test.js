/**
 * @file Contract tests for nap_users endpoints
 * @module tests/contract/napUsers
 *
 * Tests the nap-users API: register, list, get, update, archive
 * (self-prevention), restore (tenant active check). Uses supertest
 * with the real Express app and test database.
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

describe('GET /api/tenants/v1/nap-users', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/tenants/v1/nap-users');
    expect(res.status).toBe(401);
  });

  test('returns user list when authenticated', async () => {
    const cookies = await loginRoot();
    const res = await request(app).get('/api/tenants/v1/nap-users').set('Cookie', cookies);

    expect(res.status).toBe(200);
    const rows = res.body.rows ?? res.body;
    expect(rows.length).toBeGreaterThanOrEqual(1);

    // Verify password_hash is stripped
    const user = Array.isArray(rows) ? rows[0] : null;
    if (user) {
      expect(user.password_hash).toBeUndefined();
    }
  });
});

describe('POST /api/tenants/v1/nap-users/register', () => {
  test('registers a new user with valid tenant_code', async () => {
    const cookies = await loginRoot();
    const body = {
      tenant_code: 'NAP',
      email: 'newuser@napsoft.com',
      password: 'TestPass123!',
    };

    const res = await request(app)
      .post('/api/tenants/v1/nap-users/register')
      .set('Cookie', cookies)
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe('newuser@napsoft.com');
    // password_hash must not be in response
    expect(res.body.user.password_hash).toBeUndefined();
  });

  test('returns 400 for missing tenant_code', async () => {
    const cookies = await loginRoot();
    const res = await request(app)
      .post('/api/tenants/v1/nap-users/register')
      .set('Cookie', cookies)
      .send({ email: 'a@b.com', password: 'Pass123!' });

    expect(res.status).toBe(400);
  });

  test('returns 400 for invalid tenant', async () => {
    const cookies = await loginRoot();
    const res = await request(app)
      .post('/api/tenants/v1/nap-users/register')
      .set('Cookie', cookies)
      .send({ tenant_code: 'NONEXIST', email: 'x@y.com', password: 'Pass123!' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid');
  });

  test('returns 409 for duplicate email', async () => {
    const cookies = await loginRoot();
    const res = await request(app)
      .post('/api/tenants/v1/nap-users/register')
      .set('Cookie', cookies)
      .send({ tenant_code: 'NAP', email: 'newuser@napsoft.com', password: 'Pass123!' });

    expect(res.status).toBe(409);
  });
});

describe('GET /api/tenants/v1/nap-users/:id', () => {
  test('returns a single user by id without password_hash', async () => {
    const cookies = await loginRoot();

    const listRes = await request(app).get('/api/tenants/v1/nap-users').set('Cookie', cookies);
    const rows = listRes.body.rows ?? listRes.body;
    const user = Array.isArray(rows) ? rows[0] : null;
    expect(user).not.toBeNull();

    const res = await request(app).get(`/api/tenants/v1/nap-users/${user.id}`).set('Cookie', cookies);

    expect(res.status).toBe(200);
    expect(res.body.email).toBeDefined();
    expect(res.body.password_hash).toBeUndefined();
  });
});

describe('DELETE /api/tenants/v1/nap-users/archive', () => {
  test('prevents self-archival', async () => {
    const cookies = await loginRoot();

    // Get root user id via /me
    const meRes = await request(app).get('/api/auth/me').set('Cookie', cookies);
    const rootUserId = meRes.body.user.id;

    const res = await request(app)
      .delete(`/api/tenants/v1/nap-users/archive?id=${rootUserId}`)
      .set('Cookie', cookies)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('currently logged-in');
  });

  test('archives a non-self user', async () => {
    const cookies = await loginRoot();

    // Find the user we registered above
    const listRes = await request(app).get('/api/tenants/v1/nap-users').set('Cookie', cookies);
    const rows = listRes.body.rows ?? listRes.body;
    const target = (Array.isArray(rows) ? rows : []).find((u) => u.email === 'newuser@napsoft.com');
    expect(target).toBeDefined();

    const res = await request(app)
      .delete(`/api/tenants/v1/nap-users/archive?id=${target.id}`)
      .set('Cookie', cookies)
      .send({});

    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/tenants/v1/nap-users/restore', () => {
  test('restores an archived user when tenant is active', async () => {
    const cookies = await loginRoot();

    // Find archived user
    const listRes = await request(app)
      .get('/api/tenants/v1/nap-users?includeDeactivated=true')
      .set('Cookie', cookies);
    const rows = listRes.body.rows ?? listRes.body;
    const archived = (Array.isArray(rows) ? rows : []).find((u) => u.email === 'newuser@napsoft.com');
    expect(archived).toBeDefined();

    const res = await request(app)
      .patch(`/api/tenants/v1/nap-users/restore?id=${archived.id}`)
      .set('Cookie', cookies)
      .send({});

    expect(res.status).toBe(200);
  });
});
