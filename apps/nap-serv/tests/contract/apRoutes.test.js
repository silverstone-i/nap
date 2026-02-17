/**
 * @file Contract tests — AP module API shape verification
 * @module tests/contract/apRoutes
 *
 * Verifies that expected routes exist and respond with correct status codes/shapes.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import bcrypt from 'bcrypt';

// Set env
process.env.ACCESS_TOKEN_SECRET = 'test-access-secret-ap';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret-ap';
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
    'tenants', 'napUsers', 'roleMembers', 'policies', 'napUserPhones', 'napUserAddresses',
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
  ];
  for (const name of modelNames) {
    dbProxy[name] = model;
  }
  dbProxy.none = vi.fn();
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

const AP_ENDPOINTS = [
  '/api/ap/v1/ap-invoices',
  '/api/ap/v1/ap-invoice-lines',
  '/api/ap/v1/payments',
  '/api/ap/v1/ap-credit-memos',
];

describe('AP Routes Contract', () => {
  describe('Ping routes', () => {
    for (const endpoint of AP_ENDPOINTS) {
      it(`GET ${endpoint}/ping should return pong`, async () => {
        const cookies = await getAuthCookies();
        const res = await request.get(`${endpoint}/ping`).set('Cookie', cookies).set('x-tenant-code', 'NAP');
        expect(res.status).toBe(200);
        expect(res.body.message).toBe('pong');
      });
    }
  });

  describe('GET list routes', () => {
    for (const endpoint of AP_ENDPOINTS) {
      it(`GET ${endpoint} returns list`, async () => {
        const cookies = await getAuthCookies();
        const res = await request.get(endpoint).set('Cookie', cookies).set('x-tenant-code', 'NAP');
        expect(res.status).toBe(200);
        expect(res.body).toBeDefined();
      });
    }
  });

  describe('POST create routes', () => {
    it('POST /api/ap/v1/ap-invoices creates an invoice', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .post('/api/ap/v1/ap-invoices')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({
          tenant_id: 'tid', company_id: 'c1', vendor_id: 'v1',
          invoice_number: 'INV-001', invoice_date: '2025-03-01', total_amount: '5000',
        });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
    });

    it('POST /api/ap/v1/ap-invoices rejects invalid status', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .post('/api/ap/v1/ap-invoices')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({
          tenant_id: 'tid', company_id: 'c1', vendor_id: 'v1',
          invoice_number: 'INV-002', invoice_date: '2025-03-01', status: 'bogus',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid invoice status');
    });

    it('POST /api/ap/v1/ap-invoice-lines requires account_id', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .post('/api/ap/v1/ap-invoice-lines')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({ invoice_id: 'inv-1', line_number: 1, description: 'Test', quantity: 1, unit_price: 100 });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('account_id is required');
    });

    it('POST /api/ap/v1/ap-invoice-lines creates a line with account_id', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .post('/api/ap/v1/ap-invoice-lines')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({
          invoice_id: 'inv-1', line_number: 1, description: 'Lumber',
          account_id: 'acct-1', quantity: 10, unit_price: 50,
        });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
    });

    it('POST /api/ap/v1/payments rejects invalid method', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .post('/api/ap/v1/payments')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({ vendor_id: 'v1', amount: '100', method: 'bitcoin', payment_date: '2025-03-01' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid payment method');
    });

    it('POST /api/ap/v1/ap-credit-memos creates a credit memo', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .post('/api/ap/v1/ap-credit-memos')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({
          tenant_id: 'tid', vendor_id: 'v1', memo_number: 'CM-001',
          memo_date: '2025-03-01', amount: '250',
        });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
    });

    it('POST /api/ap/v1/ap-credit-memos rejects invalid status', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .post('/api/ap/v1/ap-credit-memos')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({
          tenant_id: 'tid', vendor_id: 'v1', memo_number: 'CM-002',
          memo_date: '2025-03-01', amount: '100', status: 'invalid',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid credit memo status');
    });
  });
});
