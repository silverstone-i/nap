/**
 * @file Contract tests for auth endpoints
 * @module tests/contract/auth
 *
 * Tests the auth API endpoints against the real Express app with a test
 * database. Verifies login, me, check, logout, refresh, change-password.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { bootstrapAdmin, cleanupTestDb } from '../helpers/testDb.js';

const ROOT_EMAIL = process.env.ROOT_EMAIL;
const ROOT_PASSWORD = process.env.ROOT_PASSWORD;
const ROOT_TENANT_CODE = process.env.ROOT_TENANT_CODE || 'NAP';
const ROOT_COMPANY = process.env.ROOT_COMPANY || 'NapSoft LLC';

// Must bootstrap DB before importing app (app imports db.js which calls DB.init)
let db;
beforeAll(async () => {
  await cleanupTestDb();
  db = await bootstrapAdmin();
}, 30000);

const { default: app } = await import('../../src/app.js');

afterAll(async () => {
  await cleanupTestDb();
}, 15000);

/** Helper: login with root credentials and return cookies */
async function loginRoot() {
  const res = await request(app).post('/api/auth/login').send({ email: ROOT_EMAIL, password: ROOT_PASSWORD });
  return res.headers['set-cookie'];
}

describe('POST /api/auth/login', () => {
  test('returns 200 and sets cookies for valid credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: ROOT_EMAIL,
      password: ROOT_PASSWORD,
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Logged in successfully');
    expect(res.body.forcePasswordChange).toBe(false);

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const cookieStr = cookies.join('; ');
    expect(cookieStr).toContain('auth_token');
    expect(cookieStr).toContain('refresh_token');
  });

  test('returns 400 for invalid password', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: ROOT_EMAIL,
      password: 'WrongPassword!',
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Incorrect password.');
  });

  test('returns 400 for nonexistent email', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'nobody@example.com',
      password: 'Whatever123!',
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Incorrect email.');
  });
});

describe('GET /api/auth/me', () => {
  test('returns user and tenant context when authenticated', async () => {
    const cookies = await loginRoot();

    const meRes = await request(app).get('/api/auth/me').set('Cookie', cookies);

    expect(meRes.status).toBe(200);
    expect(meRes.body.user).toBeDefined();
    expect(meRes.body.user.email).toBe(ROOT_EMAIL);
    expect(meRes.body.user.status).toBe('active');
    expect(meRes.body.tenant).toBeDefined();
    expect(meRes.body.tenant.tenant_code).toBe(ROOT_TENANT_CODE);
    expect(meRes.body.tenant.company).toBe(ROOT_COMPANY);

    // password_hash must NOT be in response
    expect(meRes.body.user.password_hash).toBeUndefined();
  });

  test('returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/check', () => {
  test('returns 200 when authenticated', async () => {
    const cookies = await loginRoot();
    const res = await request(app).get('/api/auth/check').set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Token is valid');
  });

  test('returns 401 without cookies', async () => {
    const res = await request(app).get('/api/auth/check');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  test('clears cookies and returns 200', async () => {
    const cookies = await loginRoot();
    const res = await request(app).post('/api/auth/logout').set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Logged out successfully');
  });

  test('returns 401 when no cookies present', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/refresh', () => {
  test('returns new tokens for valid refresh token', async () => {
    const cookies = await loginRoot();
    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Access token refreshed');

    const newCookies = res.headers['set-cookie'];
    expect(newCookies).toBeDefined();
  });

  test('returns 401 without refresh token', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/change-password', () => {
  const newPassword = 'NewTestPass456!';

  test('changes password successfully', async () => {
    const cookies = await loginRoot();

    const res = await request(app).post('/api/auth/change-password').set('Cookie', cookies).send({
      currentPassword: ROOT_PASSWORD,
      newPassword,
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Password changed successfully');

    // Can login with new password
    const newLoginRes = await request(app).post('/api/auth/login').send({
      email: ROOT_EMAIL,
      password: newPassword,
    });
    expect(newLoginRes.status).toBe(200);

    // Restore original password for other tests
    const newCookies = newLoginRes.headers['set-cookie'];
    await request(app).post('/api/auth/change-password').set('Cookie', newCookies).send({
      currentPassword: newPassword,
      newPassword: ROOT_PASSWORD,
    });
  });

  test('returns 403 for incorrect current password', async () => {
    const cookies = await loginRoot();

    const res = await request(app).post('/api/auth/change-password').set('Cookie', cookies).send({
      currentPassword: 'WrongPassword!',
      newPassword,
    });

    expect(res.status).toBe(403);
  });

  test('returns 400 for weak password', async () => {
    const cookies = await loginRoot();

    const res = await request(app).post('/api/auth/change-password').set('Cookie', cookies).send({
      currentPassword: ROOT_PASSWORD,
      newPassword: 'weak',
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('at least 8 characters');
  });

  test('returns 401 when not authenticated', async () => {
    const res = await request(app).post('/api/auth/change-password').send({
      currentPassword: ROOT_PASSWORD,
      newPassword,
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/health', () => {
  test('still returns 200 without auth', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
