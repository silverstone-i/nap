/**
 * @file Contract tests — Accounting module API shape verification
 * @module tests/contract/accountingRoutes
 *
 * Verifies that expected routes exist and respond with correct status codes/shapes.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import bcrypt from 'bcrypt';

// Set env
process.env.ACCESS_TOKEN_SECRET = 'test-access-secret-acct';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret-acct';
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
    // AR module
    'arClients', 'arInvoices', 'arInvoiceLines', 'receipts',
    // Accounting module
    'chartOfAccounts', 'journalEntries', 'journalEntryLines',
    'ledgerBalances', 'postingQueues', 'categoryAccountMap',
    'interCompanyAccounts', 'interCompanyTransactions', 'internalTransfers',
  ];
  for (const name of modelNames) {
    dbProxy[name] = model;
  }
  dbProxy.none = vi.fn();
  dbProxy.tx = vi.fn(async (fn) => {
    const t = {
      one: vi.fn(async () => ({ id: 'tx-entry' })),
      none: vi.fn(),
      manyOrNone: vi.fn(async () => []),
      oneOrNone: vi.fn(async () => null),
    };
    return fn(t);
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

const ACCOUNTING_ENDPOINTS = [
  '/api/accounting/v1/chart-of-accounts',
  '/api/accounting/v1/journal-entries',
  '/api/accounting/v1/journal-entry-lines',
  '/api/accounting/v1/ledger-balances',
  '/api/accounting/v1/posting-queues',
  '/api/accounting/v1/categories-account-map',
  '/api/accounting/v1/inter-company-accounts',
  '/api/accounting/v1/inter-company-transactions',
  '/api/accounting/v1/internal-transfers',
];

describe('Accounting Routes Contract', () => {
  describe('Ping routes', () => {
    for (const endpoint of ACCOUNTING_ENDPOINTS) {
      it(`GET ${endpoint}/ping should return pong`, async () => {
        const cookies = await getAuthCookies();
        const res = await request.get(`${endpoint}/ping`).set('Cookie', cookies).set('x-tenant-code', 'NAP');
        expect(res.status).toBe(200);
        expect(res.body.message).toBe('pong');
      });
    }
  });

  describe('GET list routes', () => {
    for (const endpoint of ACCOUNTING_ENDPOINTS) {
      it(`GET ${endpoint} returns list`, async () => {
        const cookies = await getAuthCookies();
        const res = await request.get(endpoint).set('Cookie', cookies).set('x-tenant-code', 'NAP');
        expect(res.status).toBe(200);
        expect(res.body).toBeDefined();
      });
    }
  });

  describe('POST create routes (mutable endpoints)', () => {
    it('POST /api/accounting/v1/chart-of-accounts creates account', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .post('/api/accounting/v1/chart-of-accounts')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({ tenant_id: 'tid', code: '1000', name: 'Cash', type: 'cash' });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
    });

    it('POST /api/accounting/v1/chart-of-accounts rejects invalid type', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .post('/api/accounting/v1/chart-of-accounts')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({ tenant_id: 'tid', code: '9999', name: 'Bad', type: 'crypto' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid account type');
    });

    it('POST /api/accounting/v1/journal-entry-lines requires account_id', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .post('/api/accounting/v1/journal-entry-lines')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({ entry_id: 'e1', debit: 100 });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('account_id is required');
    });

    it('POST /api/accounting/v1/categories-account-map rejects invalid date range', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .post('/api/accounting/v1/categories-account-map')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({ category_id: 'cat-1', account_id: 'a1', valid_from: '2025-12-01', valid_to: '2025-01-01' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('valid_to must be after valid_from');
    });

    it('POST /api/accounting/v1/internal-transfers rejects same account', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .post('/api/accounting/v1/internal-transfers')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({ from_account_id: 'a1', to_account_id: 'a1', amount: 500 });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('must be different');
    });

    it('POST /api/accounting/v1/inter-company-transactions rejects invalid module', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .post('/api/accounting/v1/inter-company-transactions')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({ module: 'hr', source_company_id: 'c1', target_company_id: 'c2' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid module');
    });
  });

  describe('Read-only ledger-balances', () => {
    it('POST /api/accounting/v1/ledger-balances is disabled', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .post('/api/accounting/v1/ledger-balances')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({ account_id: 'a1', as_of_date: '2025-01-01', balance: 1000 });
      // Should get 404 (route not found) since POST is disabled
      expect(res.status).toBe(404);
    });
  });

  describe('Custom action routes', () => {
    it('POST /api/accounting/v1/journal-entries/post requires entry_id', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .post('/api/accounting/v1/journal-entries/post')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('entry_id is required');
    });

    it('POST /api/accounting/v1/journal-entries/reverse requires entry_id', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .post('/api/accounting/v1/journal-entries/reverse')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('entry_id is required');
    });

    it('POST /api/accounting/v1/posting-queues/retry requires queue_id', async () => {
      const cookies = await getAuthCookies();
      const res = await request
        .post('/api/accounting/v1/posting-queues/retry')
        .set('Cookie', cookies)
        .set('x-tenant-code', 'NAP')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('queue_id is required');
    });
  });
});
