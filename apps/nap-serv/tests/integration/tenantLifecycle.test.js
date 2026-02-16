/**
 * @file Integration tests — tenant lifecycle (create → list → update → archive → restore)
 * @module tests/integration/tenantLifecycle
 *
 * Tests against the Express app with mocked DB, Redis, and provisioning.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import bcrypt from 'bcrypt';

// Set env
process.env.ACCESS_TOKEN_SECRET = 'test-access-secret-tenant-lifecycle';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret-tenant-lifecycle';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL_TEST = 'postgres://nap_admin:test@localhost:5432/nap_test';
process.env.NAPSOFT_TENANT = 'NAP';
process.env.COOKIE_SECURE = 'false';
process.env.BCRYPT_ROUNDS = '4';

const testUserId = '550e8400-e29b-41d4-a716-446655440000';
const testPasswordHash = await bcrypt.hash('TestPassword123!', 4);
const testTenantId = '660e8400-e29b-41d4-a716-446655440001';
let createdTenantId = null;

const mockUser = {
  id: testUserId,
  email: 'admin@napsoft.com',
  user_name: 'admin',
  password_hash: testPasswordHash,
  tenant_code: 'NAP',
  tenant_id: testTenantId,
  role: 'super_admin',
  status: 'active',
  deactivated_at: null,
};

const mockTenant = {
  id: testTenantId,
  tenant_code: 'NAP',
  company: 'NapSoft',
  schema_name: 'nap',
  status: 'active',
  deactivated_at: null,
  allowed_modules: ['tenants', 'core'],
};

// Track created records
const createdTenants = [];
const createdUsers = [];

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

// Mock tenant provisioning
vi.mock('../../src/services/tenantProvisioning.js', () => ({
  provisionTenant: vi.fn().mockResolvedValue({ applied: [] }),
}));

// Mock DB
vi.mock('../../src/db/db.js', () => {
  const createModel = (handlers) => ({
    setSchemaName: vi.fn().mockReturnValue(handlers),
  });

  const tenantsHandlers = {
    findOneBy: vi.fn(async (conditions) => {
      const cond = conditions[0];
      if (cond.tenant_code === 'NAP') return mockTenant;
      if (cond.tenant_code === 'ACME') {
        const found = createdTenants.find((t) => t.tenant_code === 'ACME' && !t.deactivated_at);
        return found || null;
      }
      return null;
    }),
    findById: vi.fn(async (id) => {
      if (id === testTenantId) return mockTenant;
      return createdTenants.find((t) => t.id === id) || null;
    }),
    findAfterCursor: vi.fn(async () => ({ data: [mockTenant, ...createdTenants], hasMore: false })),
    findWhere: vi.fn(async () => [mockTenant, ...createdTenants]),
    countWhere: vi.fn(async () => 1 + createdTenants.length),
    insert: vi.fn(async (data) => {
      const record = { id: `tenant-${Date.now()}`, ...data };
      createdTenants.push(record);
      createdTenantId = record.id;
      return record;
    }),
    updateWhere: vi.fn(async (filters, body) => {
      // Simple mock: check if any tenant matches
      if (filters[0]?.tenant_code === 'NAP') return 1;
      if (filters[0]?.id) return 1;
      if (filters.some((f) => f.tenant_code)) return 1;
      return 1;
    }),
  };

  const napUsersHandlers = {
    findOneBy: vi.fn(async (conditions, options) => {
      const cond = conditions[0];
      if (cond.email === mockUser.email) return mockUser;
      if (cond.id === mockUser.id) return mockUser;
      return null;
    }),
    findById: vi.fn(async (id) => {
      if (id === testUserId) return mockUser;
      return createdUsers.find((u) => u.id === id) || null;
    }),
    insert: vi.fn(async (data) => {
      const record = { id: `user-${Date.now()}`, ...data };
      createdUsers.push(record);
      return record;
    }),
    updateWhere: vi.fn(async () => 1),
    findAfterCursor: vi.fn(async () => ({ data: [mockUser, ...createdUsers], hasMore: false })),
    findWhere: vi.fn(async () => [mockUser, ...createdUsers]),
    countWhere: vi.fn(async () => 1 + createdUsers.length),
  };

  const roleMembersHandlers = {
    findWhere: vi.fn(async () => []),
  };

  const policiesHandlers = {
    findWhere: vi.fn(async () => []),
  };

  const napUserPhonesHandlers = {
    insert: vi.fn(async (data) => ({ id: `phone-${Date.now()}`, ...data })),
  };

  const napUserAddressesHandlers = {
    insert: vi.fn(async (data) => ({ id: `addr-${Date.now()}`, ...data })),
  };

  const models = {
    tenants: createModel(tenantsHandlers),
    napUsers: createModel(napUsersHandlers),
    roleMembers: createModel(roleMembersHandlers),
    policies: createModel(policiesHandlers),
    napUserPhones: createModel(napUserPhonesHandlers),
    napUserAddresses: createModel(napUserAddressesHandlers),
  };

  const dbProxy = function (modelName, schema) {
    const model = models[modelName];
    if (model && typeof model.setSchemaName === 'function') {
      return model.setSchemaName(schema);
    }
    throw new Error(`Unknown model: ${modelName}`);
  };
  for (const [key, val] of Object.entries(models)) {
    dbProxy[key] = val;
  }
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

beforeEach(() => {
  for (const key of Object.keys(mockRedisStore)) delete mockRedisStore[key];
});

async function loginAsAdmin() {
  const res = await request
    .post('/api/auth/login')
    .send({ email: 'admin@napsoft.com', password: 'TestPassword123!' });
  return res.headers['set-cookie'];
}

describe('Tenant Lifecycle Integration', () => {
  describe('POST /api/tenants/v1/tenants — create tenant', () => {
    it('should create a tenant with admin user', async () => {
      const cookies = await loginAsAdmin();
      const res = await request
        .post('/api/tenants/v1/tenants')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({
          tenant_code: 'ACME',
          company: 'Acme Corp',
          admin_email: 'boss@acme.com',
          admin_user_name: 'boss',
          admin_password: 'AcmePass123!',
        });

      expect(res.status).toBe(201);
      expect(res.body.tenant_code).toBe('ACME');
      expect(res.body.admin_user).toBeDefined();
    });

    it('should reject create without admin credentials', async () => {
      const cookies = await loginAsAdmin();
      const res = await request
        .post('/api/tenants/v1/tenants')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({ tenant_code: 'FAIL', company: 'Fail Corp' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/tenants/v1/tenants — list tenants', () => {
    it('should list tenants for NapSoft users', async () => {
      const cookies = await loginAsAdmin();
      const res = await request
        .get('/api/tenants/v1/tenants')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP');

      expect(res.status).toBe(200);
    });
  });

  describe('DELETE /api/tenants/v1/tenants/archive — archive tenant', () => {
    it('should reject archival of root tenant NAP', async () => {
      const cookies = await loginAsAdmin();
      const res = await request
        .delete('/api/tenants/v1/tenants/archive')
        .query({ tenant_code: 'NAP' })
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP');

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('root NapSoft tenant');
    });
  });

  describe('Non-NapSoft access', () => {
    it('should return 403 for non-NapSoft users', async () => {
      // Create a token for a non-NAP user
      const { signAccessToken } = await import('../../src/auth/jwt.js');
      const token = signAccessToken({ id: 'other-user' }, { sub: 'other-user', ph: 'abc' });

      const res = await request
        .get('/api/tenants/v1/tenants')
        .set('Cookie', [`auth_token=${token}`])
        .set('x-tenant-code', 'ACME');

      expect(res.status).toBe(403);
    });
  });
});

describe('User Registration Integration', () => {
  describe('POST /api/tenants/v1/nap-users/register', () => {
    it('should register a new user with phone and address', async () => {
      const cookies = await loginAsAdmin();
      const res = await request
        .post('/api/tenants/v1/nap-users/register')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({
          tenant_code: 'NAP',
          email: 'newuser@napsoft.com',
          password: 'NewPass123!',
          user_name: 'newuser',
          full_name: 'New User',
          role: 'member',
          phone_1: '555-1234',
          phone_1_type: 'cell',
          addresses: [
            {
              address_type: 'home',
              address_line_1: '123 Main St',
              city: 'Atlanta',
              state_province: 'GA',
              postal_code: '30301',
              country_code: 'US',
              is_primary: true,
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('User registered successfully');
      expect(res.body.user).toBeDefined();
      expect(res.body.user.password_hash).toBeUndefined();
    });

    it('should reject registration with missing fields', async () => {
      const cookies = await loginAsAdmin();
      const res = await request
        .post('/api/tenants/v1/nap-users/register')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({ email: 'incomplete@test.com' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/tenants/v1/nap-users — standard POST disabled', () => {
    it('should return 404 for standard POST (disabled)', async () => {
      const cookies = await loginAsAdmin();
      const res = await request
        .post('/api/tenants/v1/nap-users')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({ email: 'test@test.com' });

      expect(res.status).toBe(404);
    });
  });
});
