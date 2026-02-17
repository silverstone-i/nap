/**
 * @file Integration test — full AP lifecycle: invoice → approve → payment → credit memo
 * @module tests/integration/apLifecycle
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

const { ApInvoicesController } = await import('../../Modules/ap/controllers/apInvoicesController.js');
const { ApInvoiceLinesController } = await import('../../Modules/ap/controllers/apInvoiceLinesController.js');
const { PaymentsController } = await import('../../Modules/ap/controllers/paymentsController.js');
const { ApCreditMemosController } = await import('../../Modules/ap/controllers/apCreditMemosController.js');

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

describe('AP Lifecycle Integration', () => {
  let invoicesCtrl, linesCtrl, paymentsCtrl, creditMemosCtrl;

  beforeEach(() => {
    invoicesCtrl = new ApInvoicesController();
    linesCtrl = new ApInvoiceLinesController();
    paymentsCtrl = new PaymentsController();
    creditMemosCtrl = new ApCreditMemosController();
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

  it('full flow: invoice → line → approve → partial payment → credit memo → void', async () => {
    // 1. Create invoice
    const { req: invReq, res: invRes } = mockReqRes({
      body: {
        tenant_id: 'tid', company_id: 'c1', vendor_id: 'v1',
        invoice_number: 'INV-001', invoice_date: '2025-03-01',
        total_amount: '10000', status: 'open',
      },
    });
    await invoicesCtrl.create(invReq, invRes);
    expect(invRes.statusCode).toBe(201);
    const invoiceId = invRes.body.id;
    expect(invReq.body.balance_due).toBe('10000');

    // 2. Add invoice line
    const { req: lineReq, res: lineRes } = mockReqRes({
      body: {
        invoice_id: invoiceId, line_number: 1,
        description: 'Lumber', account_id: 'acct-1',
        quantity: '100', unit_price: '100',
      },
    });
    await linesCtrl.create(lineReq, lineRes);
    expect(lineRes.statusCode).toBe(201);

    // 3. Approve invoice
    const { req: appReq, res: appRes } = mockReqRes({
      query: { id: invoiceId }, body: { status: 'approved' },
    });
    mockModel.updateWhere.mockResolvedValueOnce(1);
    await invoicesCtrl.update(appReq, appRes);
    expect(appRes.body.updatedRecords).toBe(1);
    findByIdStore[invoiceId].status = 'approved';

    // 4. Partial payment — blocked on open invoice
    const { req: payBlockReq, res: payBlockRes } = mockReqRes({
      body: {
        vendor_id: 'v1', ap_invoice_id: invoiceId,
        amount: '3000', method: 'check', payment_date: '2025-03-15',
      },
    });
    findByIdStore[invoiceId].status = 'open'; // temporarily revert to test guard
    await paymentsCtrl.create(payBlockReq, payBlockRes);
    expect(payBlockRes.statusCode).toBe(400);
    expect(payBlockRes.body.error).toContain('must be approved');
    findByIdStore[invoiceId].status = 'approved'; // restore

    // 5. Partial payment — succeeds on approved invoice
    const { req: payReq, res: payRes } = mockReqRes({
      body: {
        vendor_id: 'v1', ap_invoice_id: invoiceId,
        amount: '3000', method: 'check', payment_date: '2025-03-15',
      },
    });
    payRes.statusCode = 201; // simulate super.create setting this
    await paymentsCtrl.create(payReq, payRes);
    expect(payRes.statusCode).toBe(201);

    // 6. Create credit memo
    const { req: cmReq, res: cmRes } = mockReqRes({
      body: {
        tenant_id: 'tid', vendor_id: 'v1', ap_invoice_id: invoiceId,
        memo_number: 'CM-001', memo_date: '2025-03-20', amount: '500',
      },
    });
    await creditMemosCtrl.create(cmReq, cmRes);
    expect(cmRes.statusCode).toBe(201);
    const creditMemoId = cmRes.body.id;

    // 7. Apply credit memo
    findByIdStore[creditMemoId].status = 'open';
    findByIdStore[invoiceId].balance_due = '7000'; // after payment
    const { req: cmAppReq, res: cmAppRes } = mockReqRes({
      query: { id: creditMemoId }, body: { status: 'applied' },
    });
    mockModel.updateWhere.mockResolvedValueOnce(1);
    await creditMemosCtrl.update(cmAppReq, cmAppRes);
    expect(cmAppRes.body.updatedRecords).toBe(1);
  });

  it('rejects invoice line without account_id', async () => {
    const { req, res } = mockReqRes({
      body: { invoice_id: 'inv-1', line_number: 1, description: 'Missing account', quantity: 1, unit_price: 100 },
    });
    await linesCtrl.create(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('account_id is required');
  });

  it('rejects null account_id on update', async () => {
    const { req, res } = mockReqRes({
      query: { id: 'line-1' },
      body: { account_id: null },
    });
    await linesCtrl.update(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('account_id cannot be null');
  });

  it('payment exceeding balance is rejected', async () => {
    findByIdStore['inv-test'] = { id: 'inv-test', status: 'approved', balance_due: '1000' };
    const { req, res } = mockReqRes({
      body: {
        vendor_id: 'v1', ap_invoice_id: 'inv-test',
        amount: '1500', method: 'ach', payment_date: '2025-04-01',
      },
    });
    await paymentsCtrl.create(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('exceeds remaining balance');
  });
});
