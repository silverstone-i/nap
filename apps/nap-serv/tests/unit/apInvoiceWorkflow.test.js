/**
 * @file Unit tests for AP invoice status workflow (open → approved → paid → voided)
 * @module tests/unit/apInvoiceWorkflow
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

const { ApInvoicesController, VALID_TRANSITIONS } = await import(
  '../../Modules/ap/controllers/apInvoicesController.js'
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

describe('AP Invoice Status Workflow', () => {
  let controller;

  beforeEach(() => {
    controller = new ApInvoicesController();
    vi.clearAllMocks();
  });

  it('defines valid transition map', () => {
    expect(VALID_TRANSITIONS.open).toEqual(['approved', 'voided']);
    expect(VALID_TRANSITIONS.approved).toEqual(['paid', 'voided']);
    expect(VALID_TRANSITIONS.paid).toEqual(['voided']);
    expect(VALID_TRANSITIONS.voided).toEqual([]);
  });

  it('rejects invalid status on create', async () => {
    const { req, res } = mockReqRes({ body: { status: 'bogus' } });
    await controller.create(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Invalid invoice status');
  });

  it('initializes balance_due from total_amount on create', async () => {
    mockModel.insert.mockResolvedValueOnce({ id: 'inv-1', total_amount: '5000', balance_due: '5000', status: 'open' });
    const { req, res } = mockReqRes({
      body: { vendor_id: 'v1', company_id: 'c1', invoice_number: 'INV-001', invoice_date: '2025-03-01', total_amount: '5000' },
    });
    await controller.create(req, res);
    expect(res.statusCode).toBe(201);
    expect(req.body.balance_due).toBe('5000');
  });

  it('allows open → approved', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'inv-1', status: 'open' });
    mockModel.updateWhere.mockResolvedValueOnce(1);
    const { req, res } = mockReqRes({ query: { id: 'inv-1' }, body: { status: 'approved' } });
    await controller.update(req, res);
    expect(res.body.updatedRecords).toBe(1);
  });

  it('allows open → voided', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'inv-1', status: 'open' });
    mockModel.updateWhere.mockResolvedValueOnce(1);
    const { req, res } = mockReqRes({ query: { id: 'inv-1' }, body: { status: 'voided' } });
    await controller.update(req, res);
    expect(res.body.updatedRecords).toBe(1);
  });

  it('allows approved → paid', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'inv-1', status: 'approved' });
    mockModel.updateWhere.mockResolvedValueOnce(1);
    const { req, res } = mockReqRes({ query: { id: 'inv-1' }, body: { status: 'paid' } });
    await controller.update(req, res);
    expect(res.body.updatedRecords).toBe(1);
  });

  it('allows approved → voided', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'inv-1', status: 'approved' });
    mockModel.updateWhere.mockResolvedValueOnce(1);
    const { req, res } = mockReqRes({ query: { id: 'inv-1' }, body: { status: 'voided' } });
    await controller.update(req, res);
    expect(res.body.updatedRecords).toBe(1);
  });

  it('allows paid → voided', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'inv-1', status: 'paid' });
    mockModel.updateWhere.mockResolvedValueOnce(1);
    const { req, res } = mockReqRes({ query: { id: 'inv-1' }, body: { status: 'voided' } });
    await controller.update(req, res);
    expect(res.body.updatedRecords).toBe(1);
  });

  it('rejects open → paid (skip approved)', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'inv-1', status: 'open' });
    const { req, res } = mockReqRes({ query: { id: 'inv-1' }, body: { status: 'paid' } });
    await controller.update(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Invalid status transition');
  });

  it('rejects transitions from voided', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'inv-1', status: 'voided' });
    const { req, res } = mockReqRes({ query: { id: 'inv-1' }, body: { status: 'open' } });
    await controller.update(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Invalid status transition');
  });

  it('returns 404 when invoice not found', async () => {
    mockModel.findById.mockResolvedValueOnce(null);
    const { req, res } = mockReqRes({ query: { id: 'missing' }, body: { status: 'approved' } });
    await controller.update(req, res);
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toContain('not found');
  });
});
