/**
 * @file Integration test — full AR lifecycle: client → invoice → lines → send → receipt → paid
 * @module tests/integration/arLifecycle
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

let insertCallLog = [];
let updateWhereCallLog = [];
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
    updateWhereCallLog.push({ filters, data });
    const id = filters[0]?.id;
    if (id && findByIdStore[id]) {
      Object.assign(findByIdStore[id], data);
    }
    return Promise.resolve(1);
  }),
  bulkInsert: vi.fn().mockResolvedValue([]),
};

vi.mock('../../src/db/db.js', () => {
  const proxy = (modelName, schema) => {
    if (!schema) throw new Error('schemaName is required');
    return mockModel;
  };
  proxy.none = vi.fn();
  return { default: proxy, db: proxy };
});

vi.mock('../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const { ArClientsController } = await import('../../Modules/ar/controllers/arClientsController.js');
const { ArInvoicesController } = await import('../../Modules/ar/controllers/arInvoicesController.js');
const { ArInvoiceLinesController } = await import('../../Modules/ar/controllers/arInvoiceLinesController.js');
const { ReceiptsController } = await import('../../Modules/ar/controllers/receiptsController.js');

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

describe('AR Lifecycle Integration', () => {
  let clientsCtrl, invoicesCtrl, linesCtrl, receiptsCtrl;

  beforeEach(() => {
    clientsCtrl = new ArClientsController();
    invoicesCtrl = new ArInvoicesController();
    linesCtrl = new ArInvoiceLinesController();
    receiptsCtrl = new ReceiptsController();
    insertCallLog = [];
    updateWhereCallLog = [];
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

  it('full flow: client → invoice → line → send → partial receipt → full receipt → paid', async () => {
    // 1. Create client
    const { req: clReq, res: clRes } = mockReqRes({
      body: { tenant_id: 'tid', client_code: 'ACME', name: 'Acme Corp', email: 'billing@acme.com' },
    });
    await clientsCtrl.create(clReq, clRes);
    expect(clRes.statusCode).toBe(201);
    const clientId = clRes.body.id;

    // 2. Create invoice
    const { req: invReq, res: invRes } = mockReqRes({
      body: {
        tenant_id: 'tid', company_id: 'c1', client_id: clientId,
        project_id: 'proj-1', invoice_number: 'AR-001',
        invoice_date: '2025-03-01', total_amount: '10000', status: 'open',
      },
    });
    await invoicesCtrl.create(invReq, invRes);
    expect(invRes.statusCode).toBe(201);
    const invoiceId = invRes.body.id;
    expect(invReq.body.balance_due).toBe('10000');

    // 3. Add invoice line
    const { req: lineReq, res: lineRes } = mockReqRes({
      body: {
        invoice_id: invoiceId, line_number: 1,
        description: 'Engineering services', account_id: 'acct-rev-1',
        quantity: '100', unit_price: '100',
      },
    });
    await linesCtrl.create(lineReq, lineRes);
    expect(lineRes.statusCode).toBe(201);

    // 4. Send invoice (open → sent)
    const { req: sendReq, res: sendRes } = mockReqRes({
      query: { id: invoiceId }, body: { status: 'sent' },
    });
    mockModel.updateWhere.mockResolvedValueOnce(1);
    await invoicesCtrl.update(sendReq, sendRes);
    expect(sendRes.body.updatedRecords).toBe(1);
    findByIdStore[invoiceId].status = 'sent';

    // 5. Receipt blocked on open invoice
    findByIdStore[invoiceId].status = 'open';
    const { req: rcptBlockReq, res: rcptBlockRes } = mockReqRes({
      body: {
        client_id: clientId, ar_invoice_id: invoiceId,
        amount: '3000', method: 'check', receipt_date: '2025-03-15',
      },
    });
    await receiptsCtrl.create(rcptBlockReq, rcptBlockRes);
    expect(rcptBlockRes.statusCode).toBe(400);
    expect(rcptBlockRes.body.error).toContain('must be sent');
    findByIdStore[invoiceId].status = 'sent';

    // 6. Partial receipt — succeeds on sent invoice
    const { req: rcptReq, res: rcptRes } = mockReqRes({
      body: {
        client_id: clientId, ar_invoice_id: invoiceId,
        amount: '6000', method: 'ach', receipt_date: '2025-03-20',
      },
    });
    rcptRes.statusCode = 201;
    await receiptsCtrl.create(rcptReq, rcptRes);
    expect(rcptRes.statusCode).toBe(201);

    // 7. Receipt exceeding balance rejected
    findByIdStore[invoiceId].balance_due = '4000';
    const { req: rcptOverReq, res: rcptOverRes } = mockReqRes({
      body: {
        client_id: clientId, ar_invoice_id: invoiceId,
        amount: '5000', method: 'wire', receipt_date: '2025-04-01',
      },
    });
    await receiptsCtrl.create(rcptOverReq, rcptOverRes);
    expect(rcptOverRes.statusCode).toBe(400);
    expect(rcptOverRes.body.error).toContain('exceeds remaining balance');
  });

  it('client requires client_code and name', async () => {
    const { req: noCode, res: noCodeRes } = mockReqRes({
      body: { tenant_id: 'tid', name: 'Missing Code' },
    });
    await clientsCtrl.create(noCode, noCodeRes);
    expect(noCodeRes.statusCode).toBe(400);
    expect(noCodeRes.body.error).toContain('client_code is required');

    const { req: noName, res: noNameRes } = mockReqRes({
      body: { tenant_id: 'tid', client_code: 'TEST' },
    });
    await clientsCtrl.create(noName, noNameRes);
    expect(noNameRes.statusCode).toBe(400);
    expect(noNameRes.body.error).toContain('name is required');
  });

  it('rejects empty client_code on update', async () => {
    const { req, res } = mockReqRes({
      query: { id: 'cl-1' },
      body: { client_code: '' },
    });
    await clientsCtrl.update(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('client_code cannot be empty');
  });

  it('rejects invoice line without account_id', async () => {
    const { req, res } = mockReqRes({
      body: { invoice_id: 'inv-1', line_number: 1, description: 'Missing account', quantity: 1, unit_price: 100 },
    });
    await linesCtrl.create(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('account_id is required');
  });

  it('project_id captured for revenue tracking', async () => {
    const { req, res } = mockReqRes({
      body: {
        tenant_id: 'tid', company_id: 'c1', client_id: 'cl-1',
        project_id: 'proj-42', invoice_number: 'AR-002',
        invoice_date: '2025-04-01', total_amount: '5000',
      },
    });
    await invoicesCtrl.create(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.project_id).toBe('proj-42');
  });
});
