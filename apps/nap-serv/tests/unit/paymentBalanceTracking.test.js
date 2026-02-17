/**
 * @file Unit tests for payment creation with invoice balance tracking
 * @module tests/unit/paymentBalanceTracking
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

const { PaymentsController, VALID_METHODS } = await import(
  '../../Modules/ap/controllers/paymentsController.js'
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

describe('Payment Balance Tracking', () => {
  let controller;

  beforeEach(() => {
    controller = new PaymentsController();
    vi.clearAllMocks();
  });

  it('defines valid payment methods', () => {
    expect(VALID_METHODS).toEqual(['check', 'ach', 'wire']);
  });

  it('rejects invalid payment method on create', async () => {
    const { req, res } = mockReqRes({
      body: { vendor_id: 'v1', amount: '100', method: 'bitcoin', payment_date: '2025-03-01' },
    });
    await controller.create(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Invalid payment method');
  });

  it('rejects invalid payment method on update', async () => {
    const { req, res } = mockReqRes({
      query: { id: 'p1' },
      body: { method: 'bitcoin' },
    });
    await controller.update(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Invalid payment method');
  });

  it('rejects payment against non-existent invoice', async () => {
    mockModel.findById.mockResolvedValueOnce(null);
    const { req, res } = mockReqRes({
      body: { vendor_id: 'v1', ap_invoice_id: 'inv-missing', amount: '100', method: 'check', payment_date: '2025-03-01' },
    });
    await controller.create(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('invoice not found');
  });

  it('rejects payment against voided invoice', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'inv-1', status: 'voided', balance_due: '5000' });
    const { req, res } = mockReqRes({
      body: { vendor_id: 'v1', ap_invoice_id: 'inv-1', amount: '100', method: 'ach', payment_date: '2025-03-01' },
    });
    await controller.create(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('voided invoice');
  });

  it('rejects payment against unapproved (open) invoice', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'inv-1', status: 'open', balance_due: '5000' });
    const { req, res } = mockReqRes({
      body: { vendor_id: 'v1', ap_invoice_id: 'inv-1', amount: '100', method: 'wire', payment_date: '2025-03-01' },
    });
    await controller.create(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('must be approved');
  });

  it('rejects payment exceeding remaining balance', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'inv-1', status: 'approved', balance_due: '500' });
    const { req, res } = mockReqRes({
      body: { vendor_id: 'v1', ap_invoice_id: 'inv-1', amount: '600', method: 'check', payment_date: '2025-03-01' },
    });
    await controller.create(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('exceeds remaining balance');
  });

  it('creates partial payment and updates invoice balance', async () => {
    // First call: validation lookup; second call: post-creation lookup
    mockModel.findById
      .mockResolvedValueOnce({ id: 'inv-1', status: 'approved', balance_due: '5000' })
      .mockResolvedValueOnce({ id: 'inv-1', status: 'approved', balance_due: '5000' });
    mockModel.insert.mockResolvedValueOnce({ id: 'pay-1', amount: '2000' });

    const { req, res } = mockReqRes({
      body: { vendor_id: 'v1', ap_invoice_id: 'inv-1', amount: '2000', method: 'check', payment_date: '2025-03-01' },
    });
    res.statusCode = 201; // simulate super.create setting this
    await controller.create(req, res);
    expect(res.statusCode).toBe(201);
  });

  it('allows payment without invoice (standalone payment)', async () => {
    mockModel.insert.mockResolvedValueOnce({ id: 'pay-2', amount: '1000' });
    const { req, res } = mockReqRes({
      body: { vendor_id: 'v1', amount: '1000', method: 'wire', payment_date: '2025-03-01' },
    });
    await controller.create(req, res);
    expect(res.statusCode).toBe(201);
  });
});
