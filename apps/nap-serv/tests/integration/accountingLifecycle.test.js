/**
 * @file Integration test — accounting lifecycle: chart of accounts → journal entries → post → ledger
 *       Plus category-account map, internal transfers, intercompany transactions
 * @module tests/integration/accountingLifecycle
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

let insertCallLog = [];
let findByIdStore = {};

const mockModel = {
  findAfterCursor: vi.fn().mockResolvedValue({ data: [], hasMore: false }),
  findById: vi.fn((id) => Promise.resolve(findByIdStore[id] || null)),
  findWhere: vi.fn().mockResolvedValue([]),
  countWhere: vi.fn().mockResolvedValue(0),
  insert: vi.fn((data) => {
    const id = `id-${insertCallLog.length + 1}`;
    const record = { id, ...data };
    insertCallLog.push(record);
    findByIdStore[id] = record;
    return Promise.resolve(record);
  }),
  updateWhere: vi.fn((filters, data) => {
    const id = filters[0]?.id;
    if (id && findByIdStore[id]) {
      Object.assign(findByIdStore[id], data);
    }
    return Promise.resolve(1);
  }),
  bulkInsert: vi.fn().mockResolvedValue([]),
};

const mockTx = vi.fn();

vi.mock('../../src/db/db.js', () => {
  const proxy = (modelName, schema) => {
    if (!schema) throw new Error('schemaName is required');
    return mockModel;
  };
  proxy.none = vi.fn();
  proxy.tx = (fn) => mockTx(fn);
  proxy.one = vi.fn();
  proxy.oneOrNone = vi.fn();
  proxy.manyOrNone = vi.fn();
  return { default: proxy, db: proxy };
});

vi.mock('../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const { ChartOfAccountsController } = await import('../../Modules/accounting/controllers/chartOfAccountsController.js');
const { CategoryAccountMapController } = await import('../../Modules/accounting/controllers/categoryAccountMapController.js');
const { JournalEntriesController } = await import('../../Modules/accounting/controllers/journalEntriesController.js');
const { JournalEntryLinesController } = await import('../../Modules/accounting/controllers/journalEntryLinesController.js');
const { InternalTransfersController } = await import('../../Modules/accounting/controllers/internalTransfersController.js');
const { InterCompanyTransactionsController } = await import('../../Modules/accounting/controllers/interCompanyTransactionsController.js');
const { PostingQueuesController } = await import('../../Modules/accounting/controllers/postingQueuesController.js');

function mockReqRes({ body = {}, query = {}, params = {} } = {}) {
  const req = {
    user: { id: 'u1', tenant_code: 'TEST', schema_name: 'test', tenant_id: 'tid' },
    body,
    query,
    params,
    ctx: { schema: 'test' },
  };
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  return { req, res };
}

describe('Accounting Lifecycle Integration', () => {
  let coaCtrl, mapCtrl, jeCtrl, jelCtrl, xferCtrl, icCtrl, queueCtrl;

  beforeEach(() => {
    coaCtrl = new ChartOfAccountsController();
    mapCtrl = new CategoryAccountMapController();
    jeCtrl = new JournalEntriesController();
    jelCtrl = new JournalEntryLinesController();
    xferCtrl = new InternalTransfersController();
    icCtrl = new InterCompanyTransactionsController();
    queueCtrl = new PostingQueuesController();
    insertCallLog = [];
    findByIdStore = {};
    vi.clearAllMocks();
    mockModel.findById.mockImplementation((id) => Promise.resolve(findByIdStore[id] || null));
    mockModel.insert.mockImplementation((data) => {
      const id = `id-${insertCallLog.length + 1}`;
      const record = { id, ...data };
      insertCallLog.push(record);
      findByIdStore[id] = record;
      return Promise.resolve(record);
    });
  });

  it('full chart of accounts lifecycle: create asset, liability, income, expense accounts', async () => {
    const accounts = [
      { code: '1000', name: 'Cash', type: 'cash' },
      { code: '2000', name: 'Accounts Payable', type: 'liability' },
      { code: '4000', name: 'Revenue', type: 'income' },
      { code: '5000', name: 'Cost of Goods Sold', type: 'expense' },
    ];

    for (const acct of accounts) {
      const { req, res } = mockReqRes({ body: acct });
      await coaCtrl.create(req, res);
      expect(res.statusCode).toBe(201);
      expect(res.body.id).toBeDefined();
    }

    expect(insertCallLog).toHaveLength(4);
  });

  it('rejects all invalid account types', async () => {
    const badTypes = ['crypto', 'futures', 'real_estate'];
    for (const type of badTypes) {
      const { req, res } = mockReqRes({ body: { code: '9999', name: 'Bad', type } });
      await coaCtrl.create(req, res);
      expect(res.statusCode).toBe(400);
    }
  });

  it('category-account map with valid and invalid date ranges', async () => {
    // Valid range
    const { req: goodReq, res: goodRes } = mockReqRes({
      body: { category_id: 'cat-1', account_id: 'a1', valid_from: '2025-01-01', valid_to: '2025-12-31' },
    });
    await mapCtrl.create(goodReq, goodRes);
    expect(goodRes.statusCode).toBe(201);

    // Invalid: to before from
    const { req: badReq, res: badRes } = mockReqRes({
      body: { category_id: 'cat-1', account_id: 'a1', valid_from: '2025-12-01', valid_to: '2025-01-01' },
    });
    await mapCtrl.create(badReq, badRes);
    expect(badRes.statusCode).toBe(400);

    // Same date also invalid (equal, not after)
    const { req: eqReq, res: eqRes } = mockReqRes({
      body: { category_id: 'cat-1', account_id: 'a1', valid_from: '2025-06-01', valid_to: '2025-06-01' },
    });
    await mapCtrl.create(eqReq, eqRes);
    expect(eqRes.statusCode).toBe(400);
  });

  it('journal entry line validation: requires entry_id and account_id', async () => {
    // Missing account_id
    const { req: r1, res: s1 } = mockReqRes({ body: { entry_id: 'e1', debit: 100 } });
    await jelCtrl.create(r1, s1);
    expect(s1.statusCode).toBe(400);
    expect(s1.body.error).toContain('account_id is required');

    // Missing entry_id
    const { req: r2, res: s2 } = mockReqRes({ body: { account_id: 'a1', debit: 100 } });
    await jelCtrl.create(r2, s2);
    expect(s2.statusCode).toBe(400);
    expect(s2.body.error).toContain('entry_id is required');

    // Both present → success
    const { req: r3, res: s3 } = mockReqRes({
      body: { entry_id: 'e1', account_id: 'a1', debit: 100, credit: 0 },
    });
    await jelCtrl.create(r3, s3);
    expect(s3.statusCode).toBe(201);
  });

  it('internal transfer requires different from/to accounts', async () => {
    // Same accounts
    const { req: r1, res: s1 } = mockReqRes({
      body: { from_account_id: 'a1', to_account_id: 'a1', amount: 500 },
    });
    await xferCtrl.create(r1, s1);
    expect(s1.statusCode).toBe(400);
    expect(s1.body.error).toContain('must be different');

    // Different accounts → success
    const { req: r2, res: s2 } = mockReqRes({
      body: { from_account_id: 'a1', to_account_id: 'a2', amount: 500 },
    });
    await xferCtrl.create(r2, s2);
    expect(s2.statusCode).toBe(201);
  });

  it('intercompany transaction module validation', async () => {
    // Invalid module
    const { req: r1, res: s1 } = mockReqRes({
      body: { module: 'hr', source_company_id: 'c1', target_company_id: 'c2' },
    });
    await icCtrl.create(r1, s1);
    expect(s1.statusCode).toBe(400);
    expect(s1.body.error).toContain('Invalid module');

    // Valid module
    const { req: r2, res: s2 } = mockReqRes({
      body: { module: 'ap', source_company_id: 'c1', target_company_id: 'c2', amount: '5000' },
    });
    await icCtrl.create(r2, s2);
    expect(s2.statusCode).toBe(201);
  });

  it('posting queue retry rejects non-failed entries', async () => {
    // Not found
    const { req: r1, res: s1 } = mockReqRes({ body: { queue_id: 'q-missing' } });
    await queueCtrl.retry(r1, s1);
    expect(s1.statusCode).toBe(404);

    // Not failed
    findByIdStore['q-posted'] = { id: 'q-posted', status: 'posted', journal_entry_id: 'e1' };
    const { req: r2, res: s2 } = mockReqRes({ body: { queue_id: 'q-posted' } });
    await queueCtrl.retry(r2, s2);
    expect(s2.statusCode).toBe(400);
    expect(s2.body.error).toContain('Can only retry failed');
  });

  it('journal entry rejects invalid status', async () => {
    const { req, res } = mockReqRes({ body: { status: 'final' } });
    await jeCtrl.create(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Invalid journal entry status');
  });

  it('journal entry without lines falls through to standard create', async () => {
    mockModel.insert.mockResolvedValueOnce({ id: 'je-1', status: 'pending' });
    const { req, res } = mockReqRes({
      body: { tenant_id: 'tid', company_id: 'c1', entry_date: '2025-03-01', status: 'pending' },
    });
    await jeCtrl.create(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.id).toBe('je-1');
  });
});
