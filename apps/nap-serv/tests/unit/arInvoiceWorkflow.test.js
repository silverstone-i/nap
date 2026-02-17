/**
 * @file Unit tests for AR invoice status workflow (open → sent → paid → voided)
 * @module tests/unit/arInvoiceWorkflow
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

const { ArInvoicesController, VALID_TRANSITIONS } = await import(
  '../../Modules/ar/controllers/arInvoicesController.js'
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

describe('AR Invoice Status Workflow', () => {
  let controller;

  beforeEach(() => {
    controller = new ArInvoicesController();
    vi.clearAllMocks();
  });

  it('defines valid transition map', () => {
    expect(VALID_TRANSITIONS.open).toEqual(['sent', 'voided']);
    expect(VALID_TRANSITIONS.sent).toEqual(['paid', 'voided']);
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
    mockModel.insert.mockResolvedValueOnce({ id: 'inv-1', total_amount: '8000', balance_due: '8000', status: 'open' });
    const { req, res } = mockReqRes({
      body: { client_id: 'cl1', company_id: 'c1', invoice_number: 'AR-001', invoice_date: '2025-03-01', total_amount: '8000' },
    });
    await controller.create(req, res);
    expect(res.statusCode).toBe(201);
    expect(req.body.balance_due).toBe('8000');
  });

  it('allows open → sent', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'inv-1', status: 'open' });
    mockModel.updateWhere.mockResolvedValueOnce(1);
    const { req, res } = mockReqRes({ query: { id: 'inv-1' }, body: { status: 'sent' } });
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

  it('allows sent → paid', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'inv-1', status: 'sent' });
    mockModel.updateWhere.mockResolvedValueOnce(1);
    const { req, res } = mockReqRes({ query: { id: 'inv-1' }, body: { status: 'paid' } });
    await controller.update(req, res);
    expect(res.body.updatedRecords).toBe(1);
  });

  it('allows sent → voided', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'inv-1', status: 'sent' });
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

  it('rejects open → paid (skip sent)', async () => {
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
    const { req, res } = mockReqRes({ query: { id: 'missing' }, body: { status: 'sent' } });
    await controller.update(req, res);
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toContain('not found');
  });
});
