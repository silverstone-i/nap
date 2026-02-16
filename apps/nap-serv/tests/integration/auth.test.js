/**
 * @file Integration tests for auth flow — login, refresh, logout, /me, /check
 * @module tests/integration/auth
 *
 * These tests use supertest against the Express app with mocked DB and Redis.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import bcrypt from 'bcrypt';

// Set env before any imports
process.env.ACCESS_TOKEN_SECRET = 'test-access-secret-for-integration';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret-for-integration';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL_TEST = 'postgres://nap_admin:test@localhost:5432/nap_test';
process.env.NAPSOFT_TENANT = 'NAP';
process.env.COOKIE_SECURE = 'false';

const testUserId = '550e8400-e29b-41d4-a716-446655440000';
const testPasswordHash = await bcrypt.hash('TestPassword123!', 10);

const mockUser = {
  id: testUserId,
  email: 'admin@napsoft.com',
  user_name: 'admin',
  full_name: 'Admin User',
  password_hash: testPasswordHash,
  tenant_code: 'NAP',
  tenant_id: '660e8400-e29b-41d4-a716-446655440001',
  role: 'super_admin',
  status: 'active',
  deactivated_at: null,
};

const mockTenant = {
  id: '660e8400-e29b-41d4-a716-446655440001',
  tenant_code: 'NAP',
  company: 'NapSoft',
  schema_name: 'nap',
  status: 'active',
  deactivated_at: null,
};

// Mock Redis
const mockRedisStore = {};
vi.mock('../../src/utils/redis.js', () => ({
  getRedis: vi.fn().mockResolvedValue({
    get: vi.fn((key) => Promise.resolve(mockRedisStore[key] || null)),
    set: vi.fn((key, val) => { mockRedisStore[key] = val; return Promise.resolve('OK'); }),
    del: vi.fn((key) => { delete mockRedisStore[key]; return Promise.resolve(1); }),
  }),
  closeRedis: vi.fn().mockResolvedValue(undefined),
}));

// Mock DB — the passport strategy and auth controller query admin.nap_users and admin.tenants
vi.mock('../../src/db/db.js', () => {
  const createModel = (findOneFn) => ({
    setSchemaName: vi.fn().mockReturnValue({
      findOneBy: findOneFn,
      findWhere: vi.fn().mockResolvedValue([]),
    }),
  });

  const napUsersModel = createModel(vi.fn(async (conditions) => {
    const cond = conditions[0];
    if (cond.email === mockUser.email) return mockUser;
    if (cond.id === mockUser.id) return mockUser;
    return null;
  }));

  const tenantsModel = createModel(vi.fn(async (conditions) => {
    const cond = conditions[0];
    if (cond.tenant_code === 'NAP') return mockTenant;
    return null;
  }));

  const roleMembersModel = createModel(vi.fn(async () => []));
  const policiesModel = createModel(vi.fn(async () => []));

  const dbProxy = function (modelName, schema) {
    const models = { napUsers: napUsersModel, tenants: tenantsModel, roleMembers: roleMembersModel, policies: policiesModel };
    const model = models[modelName];
    if (model && typeof model.setSchemaName === 'function') {
      return model.setSchemaName(schema);
    }
    throw new Error(`Unknown model: ${modelName}`);
  };
  dbProxy.napUsers = napUsersModel;
  dbProxy.tenants = tenantsModel;
  dbProxy.roleMembers = roleMembersModel;
  dbProxy.policies = policiesModel;

  return { default: dbProxy, db: dbProxy };
});

// Mock RbacPolicies
vi.mock('../../src/utils/RbacPolicies.js', () => ({
  loadPoliciesForUserTenant: vi.fn().mockResolvedValue({}),
}));

let request;

beforeAll(async () => {
  const supertest = await import('supertest');
  const { default: app } = await import('../../src/app.js');
  request = supertest.default(app);
});

beforeEach(() => {
  // Clear Redis store between tests
  for (const key of Object.keys(mockRedisStore)) {
    delete mockRedisStore[key];
  }
});

describe('Auth Integration', () => {
  describe('POST /api/auth/login', () => {
    it('should login with valid credentials and set cookies', async () => {
      const res = await request
        .post('/api/auth/login')
        .send({ email: 'admin@napsoft.com', password: 'TestPassword123!' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Logged in successfully');

      // Check cookies are set
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const cookieStr = cookies.join('; ');
      expect(cookieStr).toContain('auth_token');
      expect(cookieStr).toContain('refresh_token');
    });

    it('should reject invalid password', async () => {
      const res = await request
        .post('/api/auth/login')
        .send({ email: 'admin@napsoft.com', password: 'wrong-password' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Incorrect password');
    });

    it('should reject unknown email', async () => {
      const res = await request
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'anything' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Incorrect email');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should refresh tokens with a valid refresh cookie', async () => {
      // Login first to get cookies
      const loginRes = await request
        .post('/api/auth/login')
        .send({ email: 'admin@napsoft.com', password: 'TestPassword123!' });

      const cookies = loginRes.headers['set-cookie'];

      const res = await request
        .post('/api/auth/refresh')
        .set('Cookie', cookies);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Access token refreshed');
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('should return 401 without a refresh token cookie', async () => {
      const res = await request.post('/api/auth/refresh');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should clear cookies on logout', async () => {
      // Login first
      const loginRes = await request
        .post('/api/auth/login')
        .send({ email: 'admin@napsoft.com', password: 'TestPassword123!' });

      const cookies = loginRes.headers['set-cookie'];

      const res = await request
        .post('/api/auth/logout')
        .set('Cookie', cookies);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Logged out successfully');
    });

    it('should return 401 when no tokens present', async () => {
      const res = await request.post('/api/auth/logout');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return user context when authenticated', async () => {
      // Login first
      const loginRes = await request
        .post('/api/auth/login')
        .send({ email: 'admin@napsoft.com', password: 'TestPassword123!' });

      const cookies = loginRes.headers['set-cookie'];

      const res = await request
        .get('/api/auth/me')
        .set('Cookie', cookies);

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.id).toBe(testUserId);
      // password_hash should NOT be in response
      expect(res.body.user.password_hash).toBeUndefined();
    });

    it('should return 401 without auth cookie', async () => {
      const res = await request.get('/api/auth/me');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/auth/check', () => {
    it('should return 200 with valid token', async () => {
      const loginRes = await request
        .post('/api/auth/login')
        .send({ email: 'admin@napsoft.com', password: 'TestPassword123!' });

      const cookies = loginRes.headers['set-cookie'];

      const res = await request
        .get('/api/auth/check')
        .set('Cookie', cookies);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Token is valid');
    });
  });

  describe('GET /api/health', () => {
    it('should work without authentication', async () => {
      const res = await request.get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });
});
