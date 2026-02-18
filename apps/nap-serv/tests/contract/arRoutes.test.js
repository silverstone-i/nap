/**
 * @file Contract tests — AR module API shape verification
 * @module tests/contract/arRoutes
 *
 * Verifies that expected routes exist and respond with correct status codes/shapes.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import bcrypt from 'bcrypt';

// Set env
process.env.ACCESS_TOKEN_SECRET = 'test-access-secret-ar';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret-ar';
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
    'arClients', 'arInvoices', 'arInvoiceLines', 'receipts',
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

const AR_ENDPOINTS = [
  '/api/ar/v1/clients',
  '/api/ar/v1/ar-invoices',
  '/api/ar/v1/ar-invoice-lines',
  '/api/ar/v1/receipts',
];

describe('AR Routes Contract', () => {
  describe('Ping routes', () => {
    for (const endpoint of AR_ENDPOINTS) {
      it(`GET ${endpoint}/ping should return pong`, async () => {
        const cookies = await getAuthCookies();
        const res = await request.get(`${endpoint}/ping`).set('Cookie', cookies).set('x-tenant-code', 'NAP');
        expect(res.status).toBe(200);
        expect(res.body.message).toBe('pong');
      });
    }
  });

  describe('GET list routes', () => {
    for (const endpoint of AR_ENDPOINTS) {
      it(`GET ${endpoint} returns list`, async () => {
        const cookies = await getAuthCookies();
        const res = await request.get(endpoint).set('Cookie', cookies).set('x-tenant-code', 'NAP');
        expect(res.status).toBe(200);
        expect(res.body).toBeDefined();
      });
    }
  });

  describe('POST create routes', () => {
    it('POST /api/ar/v1/clients creates a client', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .post('/api/ar/v1/clients')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({ tenant_id: 'tid', client_code: 'ACME', name: 'Acme Corp' });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
    });

    it('POST /api/ar/v1/clients rejects missing client_code', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .post('/api/ar/v1/clients')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({ tenant_id: 'tid', name: 'No Code Corp' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('client_code is required');
    });

    it('POST /api/ar/v1/ar-invoices creates an invoice', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .post('/api/ar/v1/ar-invoices')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({
          tenant_id: 'tid', company_id: 'c1', client_id: 'cl1',
          invoice_number: 'AR-001', invoice_date: '2025-03-01', total_amount: '5000',
        });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
    });

    it('POST /api/ar/v1/ar-invoices rejects invalid status', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .post('/api/ar/v1/ar-invoices')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({
          tenant_id: 'tid', company_id: 'c1', client_id: 'cl1',
          invoice_number: 'AR-002', invoice_date: '2025-03-01', status: 'bogus',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid invoice status');
    });

    it('POST /api/ar/v1/ar-invoice-lines requires account_id', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .post('/api/ar/v1/ar-invoice-lines')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({ invoice_id: 'inv-1', line_number: 1, description: 'Test', quantity: 1, unit_price: 100 });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('account_id is required');
    });

    it('POST /api/ar/v1/ar-invoice-lines creates a line with account_id', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .post('/api/ar/v1/ar-invoice-lines')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({
          invoice_id: 'inv-1', line_number: 1, description: 'Engineering',
          account_id: 'acct-1', quantity: 10, unit_price: 50,
        });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
    });

    it('POST /api/ar/v1/receipts rejects invalid method', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .post('/api/ar/v1/receipts')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({ client_id: 'cl1', amount: '100', method: 'bitcoin', receipt_date: '2025-03-01' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid receipt method');
    });

    it('POST /api/ar/v1/receipts creates a receipt with valid method', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .post('/api/ar/v1/receipts')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({ tenant_id: 'tid', client_id: 'cl1', amount: '500', method: 'check', receipt_date: '2025-03-01' });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
    });
  });

  describe('RBAC-gated approval route', () => {
    it('PUT /api/ar/v1/ar-invoices/approve is accessible (super_user)', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .put('/api/ar/v1/ar-invoices/approve')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .query({ id: 'inv-1' })
        .send({});
      // super_user bypasses RBAC; controller returns 404 because mock invoice doesn't exist
      // Key assertion: route exists (not a routing 404) and RBAC did not block (not 403)
      expect(res.status).not.toBe(403);
      expect(res.body.error).toContain('ar-invoice not found');
    });
  });
});
