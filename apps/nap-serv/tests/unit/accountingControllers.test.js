/**
 * @file Unit tests for accounting controllers — chart of accounts, category-account map,
 *       journal entries, internal transfers, intercompany transactions, posting queues
 * @module tests/unit/accountingControllers
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockModel = {
  findAfterCursor: vi.fn().mockResolvedValue({ data: [], hasMore: false }),
  findById: vi.fn().mockResolvedValue(null),
  findWhere: vi.fn().mockResolvedValue([]),
  countWhere: vi.fn().mockResolvedValue(0),
  insert: vi.fn().mockResolvedValue({ id: 'new-id' }),
  updateWhere: vi.fn().mockResolvedValue(1),
  bulkInsert: vi.fn().mockResolvedValue([{ id: '1' }]),
};

const mockTx = vi.fn().mockImplementation(async (fn) => {
  const t = { one: vi.fn().mockResolvedValue({ id: 'e1' }), none: vi.fn(), manyOrNone: vi.fn().mockResolvedValue([]), oneOrNone: vi.fn() };
  return fn(t);
});

vi.mock('../../src/db/db.js', () => {
  const proxy = (modelName, schema) => {
    if (!schema) throw new Error('schemaName is required');
    return mockModel;
  };
  proxy.none = vi.fn();
  proxy.tx = mockTx;
  proxy.one = vi.fn();
  proxy.oneOrNone = vi.fn();
  proxy.manyOrNone = vi.fn();
  return { default: proxy, db: proxy };
});

vi.mock('../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const { ChartOfAccountsController, VALID_TYPES } = await import(
  '../../Modules/accounting/controllers/chartOfAccountsController.js'
);
const { CategoryAccountMapController } = await import(
  '../../Modules/accounting/controllers/categoryAccountMapController.js'
);
const { JournalEntriesController, VALID_STATUSES } = await import(
  '../../Modules/accounting/controllers/journalEntriesController.js'
);
const { JournalEntryLinesController } = await import(
  '../../Modules/accounting/controllers/journalEntryLinesController.js'
);
const { InternalTransfersController } = await import(
  '../../Modules/accounting/controllers/internalTransfersController.js'
);
const { InterCompanyTransactionsController, VALID_MODULES } = await import(
  '../../Modules/accounting/controllers/interCompanyTransactionsController.js'
);
const { PostingQueuesController } = await import(
  '../../Modules/accounting/controllers/postingQueuesController.js'
);

function mockReqRes({ body = {}, query = {}, params = {} } = {}) {
  const req = {
    user: { id: 'u1', tenant_code: 'TEST', schema_name: 'test' },
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

describe('Chart of Accounts Controller', () => {
  let ctrl;

  beforeEach(() => {
    ctrl = new ChartOfAccountsController();
    vi.clearAllMocks();
  });

  it('exports valid account types', () => {
    expect(VALID_TYPES).toEqual(['asset', 'liability', 'equity', 'income', 'expense', 'cash', 'bank']);
  });

  it('rejects invalid account type on create', async () => {
    const { req, res } = mockReqRes({ body: { type: 'crypto' } });
    await ctrl.create(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Invalid account type');
  });

  it('allows valid account type on create', async () => {
    mockModel.insert.mockResolvedValueOnce({ id: 'acct-1', type: 'asset' });
    const { req, res } = mockReqRes({ body: { code: '1000', name: 'Cash', type: 'asset' } });
    await ctrl.create(req, res);
    expect(res.statusCode).toBe(201);
  });

  it('rejects invalid account type on update', async () => {
    const { req, res } = mockReqRes({ query: { id: 'a1' }, body: { type: 'invalid' } });
    await ctrl.update(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Invalid account type');
  });
});

describe('Category-Account Map Controller', () => {
  let ctrl;

  beforeEach(() => {
    ctrl = new CategoryAccountMapController();
    vi.clearAllMocks();
  });

  it('rejects when valid_to <= valid_from on create', async () => {
    const { req, res } = mockReqRes({
      body: { category_id: 'cat-1', account_id: 'a1', valid_from: '2025-06-01', valid_to: '2025-01-01' },
    });
    await ctrl.create(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('valid_to must be after valid_from');
  });

  it('rejects missing category_id on create', async () => {
    const { req, res } = mockReqRes({ body: { account_id: 'a1' } });
    await ctrl.create(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('category_id is required');
  });

  it('rejects missing account_id on create', async () => {
    const { req, res } = mockReqRes({ body: { category_id: 'cat-1' } });
    await ctrl.create(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('account_id is required');
  });

  it('allows valid date range on create', async () => {
    mockModel.insert.mockResolvedValueOnce({ id: 'map-1' });
    const { req, res } = mockReqRes({
      body: { category_id: 'cat-1', account_id: 'a1', valid_from: '2025-01-01', valid_to: '2025-12-31' },
    });
    await ctrl.create(req, res);
    expect(res.statusCode).toBe(201);
  });

  it('rejects when valid_to <= valid_from on update', async () => {
    const { req, res } = mockReqRes({
      query: { id: 'map-1' },
      body: { valid_from: '2025-06-01', valid_to: '2025-03-01' },
    });
    await ctrl.update(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('valid_to must be after valid_from');
  });
});

describe('Journal Entries Controller', () => {
  let ctrl;

  beforeEach(() => {
    ctrl = new JournalEntriesController();
    vi.clearAllMocks();
  });

  it('exports valid statuses', () => {
    expect(VALID_STATUSES).toEqual(['pending', 'posted', 'reversed']);
  });

  it('rejects invalid status on create', async () => {
    const { req, res } = mockReqRes({ body: { status: 'bogus' } });
    await ctrl.create(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Invalid journal entry status');
  });

  it('post requires entry_id', async () => {
    const { req, res } = mockReqRes({ body: {} });
    await ctrl.post(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('entry_id is required');
  });

  it('reverse requires entry_id', async () => {
    const { req, res } = mockReqRes({ body: {} });
    await ctrl.reverse(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('entry_id is required');
  });
});

describe('Journal Entry Lines Controller', () => {
  let ctrl;

  beforeEach(() => {
    ctrl = new JournalEntryLinesController();
    vi.clearAllMocks();
  });

  it('rejects missing account_id on create', async () => {
    const { req, res } = mockReqRes({ body: { entry_id: 'e1', debit: 100 } });
    await ctrl.create(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('account_id is required');
  });

  it('rejects missing entry_id on create', async () => {
    const { req, res } = mockReqRes({ body: { account_id: 'a1', debit: 100 } });
    await ctrl.create(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('entry_id is required');
  });

  it('rejects null account_id on update', async () => {
    const { req, res } = mockReqRes({ query: { id: 'l1' }, body: { account_id: null } });
    await ctrl.update(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('account_id cannot be null');
  });
});

describe('Internal Transfers Controller', () => {
  let ctrl;

  beforeEach(() => {
    ctrl = new InternalTransfersController();
    vi.clearAllMocks();
  });

  it('rejects missing from_account_id on create', async () => {
    const { req, res } = mockReqRes({ body: { to_account_id: 'a2', amount: 500 } });
    await ctrl.create(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('from_account_id is required');
  });

  it('rejects missing to_account_id on create', async () => {
    const { req, res } = mockReqRes({ body: { from_account_id: 'a1', amount: 500 } });
    await ctrl.create(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('to_account_id is required');
  });

  it('rejects same from and to account', async () => {
    const { req, res } = mockReqRes({
      body: { from_account_id: 'a1', to_account_id: 'a1', amount: 500 },
    });
    await ctrl.create(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('must be different');
  });

  it('allows valid transfer create', async () => {
    mockModel.insert.mockResolvedValueOnce({ id: 'xfer-1' });
    const { req, res } = mockReqRes({
      body: { from_account_id: 'a1', to_account_id: 'a2', amount: 1000 },
    });
    await ctrl.create(req, res);
    expect(res.statusCode).toBe(201);
  });
});

describe('Inter-Company Transactions Controller', () => {
  let ctrl;

  beforeEach(() => {
    ctrl = new InterCompanyTransactionsController();
    vi.clearAllMocks();
  });

  it('exports valid modules', () => {
    expect(VALID_MODULES).toEqual(['ar', 'ap', 'je']);
  });

  it('rejects invalid module on create', async () => {
    const { req, res } = mockReqRes({ body: { module: 'hr' } });
    await ctrl.create(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Invalid module');
  });

  it('allows valid module on create', async () => {
    mockModel.insert.mockResolvedValueOnce({ id: 'ic-1' });
    const { req, res } = mockReqRes({ body: { module: 'ap', source_company_id: 'c1', target_company_id: 'c2' } });
    await ctrl.create(req, res);
    expect(res.statusCode).toBe(201);
  });
});

describe('Posting Queues Controller', () => {
  let ctrl;

  beforeEach(() => {
    ctrl = new PostingQueuesController();
    vi.clearAllMocks();
  });

  it('retry requires queue_id', async () => {
    const { req, res } = mockReqRes({ body: {} });
    await ctrl.retry(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('queue_id is required');
  });

  it('retry returns 404 for non-existent queue entry', async () => {
    mockModel.findById.mockResolvedValueOnce(null);
    const { req, res } = mockReqRes({ body: { queue_id: 'q1' } });
    await ctrl.retry(req, res);
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toContain('not found');
  });

  it('retry rejects non-failed queue entry', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'q1', status: 'posted' });
    const { req, res } = mockReqRes({ body: { queue_id: 'q1' } });
    await ctrl.retry(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Can only retry failed entries');
  });
});
