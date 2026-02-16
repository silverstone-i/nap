/**
 * @file Contract tests — tenant and user router API shape verification
 * @module tests/contract/tenantRoutes
 *
 * Verifies that expected routes exist and respond with correct status codes/shapes.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import bcrypt from 'bcrypt';

// Set env
process.env.ACCESS_TOKEN_SECRET = 'test-access-secret-contract';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret-contract';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL_TEST = 'postgres://nap_admin:test@localhost:5432/nap_test';
process.env.NAPSOFT_TENANT = 'NAP';
process.env.COOKIE_SECURE = 'false';
process.env.BCRYPT_ROUNDS = '4';

const testPasswordHash = await bcrypt.hash('TestPassword123!', 4);
const mockUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'admin@napsoft.com',
  user_name: 'admin',
  password_hash: testPasswordHash,
  tenant_code: 'NAP',
  tenant_id: '660e8400-e29b-41d4-a716-446655440001',
  role: 'super_user',
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
  allowed_modules: [],
};

// Mock Redis
vi.mock('../../src/utils/redis.js', () => ({
  getRedis: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  }),
  closeRedis: vi.fn(),
}));

// Mock provisioning
vi.mock('../../src/services/tenantProvisioning.js', () => ({
  provisionTenant: vi.fn().mockResolvedValue({ applied: [] }),
}));

// Mock DB
vi.mock('../../src/db/db.js', () => {
  const handler = {
    findOneBy: vi.fn(async (conds) => {
      const c = conds[0];
      if (c.email === mockUser.email || c.id === mockUser.id) return mockUser;
      if (c.tenant_code === 'NAP') return mockTenant;
      return null;
    }),
    findById: vi.fn(async (id) => {
      if (id === mockTenant.id) return mockTenant;
      if (id === mockUser.id) return mockUser;
      return null;
    }),
    findAfterCursor: vi.fn(async () => ({ data: [], hasMore: false })),
    findWhere: vi.fn(async () => []),
    countWhere: vi.fn(async () => 0),
    insert: vi.fn(async (data) => ({ id: `new-${Date.now()}`, ...data })),
    updateWhere: vi.fn(async () => 1),
    bulkInsert: vi.fn(async (data) => data),
  };

  const model = { setSchemaName: vi.fn().mockReturnValue(handler) };

  const dbProxy = (name, schema) => model.setSchemaName(schema);
  dbProxy.tenants = model;
  dbProxy.napUsers = model;
  dbProxy.roleMembers = model;
  dbProxy.policies = model;
  dbProxy.napUserPhones = model;
  dbProxy.napUserAddresses = model;
  return { default: dbProxy, db: dbProxy };
});

vi.mock('../../src/utils/RbacPolicies.js', () => ({
  loadPoliciesForUserTenant: vi.fn().mockResolvedValue({}),
}));

let request;

beforeAll(async () => {
  const supertest = await import('supertest');
  const { default: app } = await import('../../src/app.js');
  request = supertest.default(app);
});

async function getAuthCookies() {
  const res = await request.post('/api/auth/login').send({ email: 'admin@napsoft.com', password: 'TestPassword123!' });
  return res.headers['set-cookie'];
}

describe('Tenant Routes Contract', () => {
  describe('Route existence', () => {
    it('GET /api/tenants/v1/tenants/ping should return pong', async () => {
      const cookies = await getAuthCookies();
      const res = await request.get('/api/tenants/v1/tenants/ping').set('Cookie', cookies).set('x-tenant-code', 'NAP');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('pong');
    });

    it('GET /api/tenants/v1/nap-users/ping should return pong', async () => {
      const cookies = await getAuthCookies();
      const res = await request.get('/api/tenants/v1/nap-users/ping').set('Cookie', cookies).set('x-tenant-code', 'NAP');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('pong');
    });
  });

  describe('Tenant CRUD shape', () => {
    it('GET /api/tenants/v1/tenants returns list', async () => {
      const cookies = await getAuthCookies();
      const res = await request.get('/api/tenants/v1/tenants').set('Cookie', cookies).set('x-tenant-code', 'NAP');
      expect(res.status).toBe(200);
      expect(res.body).toBeDefined();
    });

    it('GET /api/tenants/v1/tenants/:id returns tenant or 404', async () => {
      const cookies = await getAuthCookies();
      const res = await request.get(`/api/tenants/v1/tenants/${mockTenant.id}`).set('Cookie', cookies).set('x-tenant-code', 'NAP');
      expect([200, 404]).toContain(res.status);
    });

    it('GET /api/tenants/v1/tenants/:id/modules returns allowed_modules', async () => {
      const cookies = await getAuthCookies();
      const res = await request.get(`/api/tenants/v1/tenants/${mockTenant.id}/modules`).set('Cookie', cookies).set('x-tenant-code', 'NAP');
      expect([200, 404]).toContain(res.status);
    });
  });

  describe('Admin routes', () => {
    it('GET /api/tenants/v1/admin/schemas returns schema list', async () => {
      const cookies = await getAuthCookies();
      const res = await request.get('/api/tenants/v1/admin/schemas').set('Cookie', cookies).set('x-tenant-code', 'NAP');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('POST /api/core/v1/admin/assume-tenant requires tenant_code', async () => {
      const cookies = await getAuthCookies();
      const res = await request.post('/api/core/v1/admin/assume-tenant').set('Cookie', cookies).set('x-tenant-code', 'NAP').send({});
      expect(res.status).toBe(400);
    });

    it('POST /api/core/v1/admin/assume-tenant succeeds with tenant_code', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .post('/api/core/v1/admin/assume-tenant')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({ tenant_code: 'ACME', reason: 'testing' });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Assumed tenant');
    });

    it('POST /api/core/v1/admin/exit-assumption succeeds', async () => {
      const cookies = await getAuthCookies();
      const res = await request.post('/api/core/v1/admin/exit-assumption').set('Cookie', cookies).set('x-tenant-code', 'NAP');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Exited assumption');
    });
  });
});
