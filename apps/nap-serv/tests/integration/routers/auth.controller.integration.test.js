import db from '../../../src/db/db.js';
import request from 'supertest';
import app from '../../../src/app.js';
import { describe, it, expect, beforeAll } from 'vitest';
import { setupAdminSchemaAndUser } from '../../util/testHelpers.js';

describe('Auth Controller Integration', () => {
  let server;

  beforeAll(async () => {
    server = app.listen();
    await setupAdminSchemaAndUser();
  });

  afterAll(() => {
    server.close();
  });

  it('POST /auth/login - should return 400 on missing credentials', async () => {
    const res = await request(server).post('/api/tenants/v1/auth/login').send({});
    expect(res.status).toBe(400);
  });

  it('POST /auth/refresh - should return 401 without refresh token', async () => {
    const res = await request(server).post('/api/tenants/v1/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('POST /auth/logout - should return 401 if not authenticated', async () => {
    const res = await request(server).post('/api/tenants/v1/auth/logout');
    expect(res.status).toBe(401);
  });

  it('GET /auth/check - should return 401 if no JWT is provided', async () => {
    const res = await request(server).get('/api/tenants/v1/auth/check');
    expect(res.status).toBe(401);
  });

  it('POST /auth/login - should succeed with valid credentials', async () => {
    const res = await request(server).post('/api/tenants/v1/auth/login').send({
      email: 'testuser@example.com',
      password: 'TestPassword123',
    });

    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies.some(c => c.includes('refresh_token'))).toBe(true);
    expect(cookies.some(c => c.includes('auth_token'))).toBe(true);
  });

  it('POST /auth/refresh - should succeed with valid refresh token', async () => {
    const login = await request(server).post('/api/tenants/v1/auth/login').send({
      email: 'testuser@example.com',
      password: 'TestPassword123',
    });

    const refreshCookie = login.headers['set-cookie'].find(c => c.includes('refresh_token'));
    const res = await request(server)
      .post('/api/tenants/v1/auth/refresh')
      .set('Cookie', refreshCookie);

    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'];
    expect(cookies.some(c => c.includes('auth_token'))).toBe(true);
  });

  it('POST /auth/logout - should clear cookies after login', async () => {
    const login = await request(server).post('/api/tenants/v1/auth/login').send({
      email: 'testuser@example.com',
      password: 'TestPassword123',
    });

    const authCookies = login.headers['set-cookie'];
    const res = await request(server)
      .post('/api/tenants/v1/auth/logout')
      .set('Cookie', authCookies);

    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'];
    expect(cookies.some(c => c.includes('refresh_token=;'))).toBe(true);
    expect(cookies.some(c => c.includes('auth_token=;'))).toBe(true);
  });
});