/**
 * @file Contract tests — project module API shape verification
 * @module tests/contract/projectRoutes
 *
 * Verifies that expected routes exist and respond with correct status codes/shapes.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import bcrypt from 'bcrypt';

// Set env
process.env.ACCESS_TOKEN_SECRET = 'test-access-secret-project';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret-project';
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

  // Register all model names the proxy needs to resolve
  const modelNames = [
    'tenants', 'napUsers', 'roles', 'roleMembers', 'policies', 'policyCatalog', 'napUserPhones', 'napUserAddresses',
    'projects', 'units', 'tasks', 'taskGroups', 'tasksMaster',
    'costItems', 'changeOrders',
    'templateUnits', 'templateTasks', 'templateCostItems', 'templateChangeOrders',
  ];
  for (const name of modelNames) {
    dbProxy[name] = model;
  }
  dbProxy.none = vi.fn();
  dbProxy.result = vi.fn(async () => ({ rowCount: 1 }));
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

const PROJECT_ENDPOINTS = [
  '/api/projects/v1/projects',
  '/api/projects/v1/units',
  '/api/projects/v1/tasks',
  '/api/projects/v1/task-groups',
  '/api/projects/v1/tasks-master',
  '/api/projects/v1/cost-items',
  '/api/projects/v1/change-orders',
  '/api/projects/v1/template-units',
  '/api/projects/v1/template-tasks',
  '/api/projects/v1/template-cost-items',
  '/api/projects/v1/template-change-orders',
];

describe('Project Routes Contract', () => {
  describe('Ping routes', () => {
    for (const endpoint of PROJECT_ENDPOINTS) {
      it(`GET ${endpoint}/ping should return pong`, async () => {
        const cookies = await getAuthCookies();
        const res = await request.get(`${endpoint}/ping`).set('Cookie', cookies).set('x-tenant-code', 'NAP');
        expect(res.status).toBe(200);
        expect(res.body.message).toBe('pong');
      });
    }
  });

  describe('GET list routes', () => {
    for (const endpoint of PROJECT_ENDPOINTS) {
      it(`GET ${endpoint} returns list`, async () => {
        const cookies = await getAuthCookies();
        const res = await request.get(endpoint).set('Cookie', cookies).set('x-tenant-code', 'NAP');
        expect(res.status).toBe(200);
        expect(res.body).toBeDefined();
      });
    }
  });

  describe('POST create routes', () => {
    it('POST /api/projects/v1/projects creates a project', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .post('/api/projects/v1/projects')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({ tenant_id: 'tid', project_code: 'P001', name: 'Test', contract_amount: '50000' });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
    });

    it('POST /api/projects/v1/cost-items rejects invalid cost_class', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .post('/api/projects/v1/cost-items')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({ task_id: 't1', cost_class: 'invalid', cost_source: 'budget' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid cost_class');
    });
  });
});
