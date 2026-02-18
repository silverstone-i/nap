/**
 * @file Contract tests — Core module API shape verification
 * @module tests/contract/coreRoutes
 *
 * Verifies that expected routes exist and respond with correct status codes/shapes.
 * Sources router is read-only; all other core entity routers support full CRUD.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import bcrypt from 'bcrypt';

// Set env
process.env.ACCESS_TOKEN_SECRET = 'test-access-secret-core';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret-core';
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
    // Core entities
    'sources', 'vendors', 'clients', 'employees', 'contacts', 'addresses', 'interCompanies',
    // Projects module
    'projects', 'units', 'tasks', 'taskGroups', 'tasksMaster',
    'costItems', 'changeOrders',
    'templateUnits', 'templateTasks', 'templateCostItems', 'templateChangeOrders',
    // Activities module
    'categories', 'activities', 'deliverables', 'deliverableAssignments',
    'budgets', 'costLines', 'actualCosts', 'vendorParts',
    // BOM module
    'catalogSkus', 'vendorSkus', 'vendorPricing',
    // AP module
    'apInvoices', 'apInvoiceLines', 'payments', 'apCreditMemos',
    // AR module
    'arInvoices', 'arInvoiceLines', 'receipts', 'arCreditMemos',
    // Accounting module
    'chartOfAccounts', 'fiscalPeriods', 'journalEntries', 'journalEntryLines',
    'categoryAccountMap', 'interCompanyTransactions', 'costCenters',
    'budgetEntries', 'recurringJournals',
  ];
  for (const name of modelNames) {
    dbProxy[name] = model;
  }
  dbProxy.none = vi.fn();
  dbProxy.result = vi.fn(async () => ({ rowCount: 1 }));
  dbProxy.tx = vi.fn(async (cb) => {
    const t = { none: vi.fn() };
    return cb(t);
  });
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

const CORE_ENDPOINTS = [
  '/api/core/v1/sources',
  '/api/core/v1/vendors',
  '/api/core/v1/clients',
  '/api/core/v1/employees',
  '/api/core/v1/contacts',
  '/api/core/v1/addresses',
  '/api/core/v1/inter-companies',
  '/api/core/v1/roles',
  '/api/core/v1/role-members',
  '/api/core/v1/policies',
  '/api/core/v1/policy-catalog',
];

const CRUD_ENDPOINTS = CORE_ENDPOINTS.filter((e) => e !== '/api/core/v1/sources');

describe('Core Routes Contract', () => {
  describe('Ping routes', () => {
    for (const endpoint of CORE_ENDPOINTS) {
      it(`GET ${endpoint}/ping should return pong`, async () => {
        const cookies = await getAuthCookies();
        const res = await request.get(`${endpoint}/ping`).set('Cookie', cookies).set('x-tenant-code', 'NAP');
        expect(res.status).toBe(200);
        expect(res.body.message).toBe('pong');
      });
    }
  });

  describe('GET list routes', () => {
    for (const endpoint of CORE_ENDPOINTS) {
      it(`GET ${endpoint} returns list`, async () => {
        const cookies = await getAuthCookies();
        const res = await request.get(endpoint).set('Cookie', cookies).set('x-tenant-code', 'NAP');
        expect(res.status).toBe(200);
        expect(res.body).toBeDefined();
      });
    }
  });

  describe('Sources read-only enforcement', () => {
    it('POST /api/core/v1/sources returns 404', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .post('/api/core/v1/sources')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({ tenant_id: 'tid', table_id: 'v1', source_type: 'vendor' });
      expect(res.status).toBe(404);
    });

    it('PUT /api/core/v1/sources/update returns 404', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .put('/api/core/v1/sources/update')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({ label: 'updated' });
      expect(res.status).toBe(404);
    });

    it('DELETE /api/core/v1/sources/archive returns 404', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .delete('/api/core/v1/sources/archive')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP');
      expect(res.status).toBe(404);
    });

    it('PATCH /api/core/v1/sources/restore returns 404', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .patch('/api/core/v1/sources/restore')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP');
      expect(res.status).toBe(404);
    });
  });

  describe('POST create routes (CRUD entities)', () => {
    it('POST /api/core/v1/vendors creates a vendor', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .post('/api/core/v1/vendors')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({ tenant_id: 'tid', name: 'Acme Lumber', code: 'ACM-001' });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
    });

    it('POST /api/core/v1/clients creates a client', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .post('/api/core/v1/clients')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({ tenant_id: 'tid', name: 'Big Builder Corp', code: 'BBC-001' });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
    });

    it('POST /api/core/v1/employees creates an employee', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .post('/api/core/v1/employees')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({ tenant_id: 'tid', first_name: 'John', last_name: 'Doe' });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
    });

    it('POST /api/core/v1/contacts creates a contact', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .post('/api/core/v1/contacts')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({ tenant_id: 'tid', source_id: 'src-1', first_name: 'Jane', last_name: 'Smith' });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
    });

    it('POST /api/core/v1/addresses creates an address', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .post('/api/core/v1/addresses')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({ tenant_id: 'tid', source_id: 'src-1', address_line1: '123 Main St', city: 'Springfield', state: 'IL', zip: '62701' });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
    });

    it('POST /api/core/v1/inter-companies creates an inter-company', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .post('/api/core/v1/inter-companies')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({ tenant_id: 'tid', name: 'NapSoft West', code: 'NSW-001' });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
    });
  });

  describe('RBAC management routes', () => {
    it('POST /api/core/v1/roles creates a role', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .post('/api/core/v1/roles')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({ code: 'pm', name: 'Project Manager', scope: 'assigned_projects' });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
    });

    it('POST /api/core/v1/roles rejects system role creation', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .post('/api/core/v1/roles')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({ code: 'sys', name: 'System', is_system: true });
      expect(res.status).toBe(400);
    });

    it('Policy catalog is read-only — POST returns 404', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .post('/api/core/v1/policy-catalog')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({ module: 'test', label: 'Test' });
      expect(res.status).toBe(404);
    });

    it('PUT /api/core/v1/policies/sync-for-role syncs policies', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .put('/api/core/v1/policies/sync-for-role')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({ role_id: 'r1', policies: [{ module: 'ar', router: null, action: null, level: 'view' }] });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Policies synced for role');
    });

    it('PUT /api/core/v1/role-members/sync syncs members', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .put('/api/core/v1/role-members/sync')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({ role_id: 'r1', user_ids: ['u1', 'u2'] });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Role members synced');
    });

    it('DELETE /api/core/v1/role-members/remove deletes a member', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .delete('/api/core/v1/role-members/remove')
        .query({ role_id: 'r1', user_id: 'u1' })
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Role member removed');
    });
  });
});
