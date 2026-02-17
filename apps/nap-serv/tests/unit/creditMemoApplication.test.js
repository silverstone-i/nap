/**
 * @file Unit tests for AP credit memo status workflow and invoice balance reduction
 * @module tests/unit/creditMemoApplication
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

const { ApCreditMemosController, VALID_TRANSITIONS } = await import(
  '../../Modules/ap/controllers/apCreditMemosController.js'
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

describe('AP Credit Memo Workflow', () => {
  let controller;

  beforeEach(() => {
    controller = new ApCreditMemosController();
    vi.clearAllMocks();
  });

  it('defines valid transition map', () => {
    expect(VALID_TRANSITIONS.open).toEqual(['applied', 'voided']);
    expect(VALID_TRANSITIONS.applied).toEqual(['voided']);
    expect(VALID_TRANSITIONS.voided).toEqual([]);
  });

  it('rejects invalid status on create', async () => {
    const { req, res } = mockReqRes({ body: { status: 'bogus' } });
    await controller.create(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Invalid credit memo status');
  });

  it('allows valid status on create', async () => {
    mockModel.insert.mockResolvedValueOnce({ id: 'cm-1', status: 'open' });
    const { req, res } = mockReqRes({
      body: { vendor_id: 'v1', memo_number: 'CM-001', memo_date: '2025-03-01', amount: '500', status: 'open' },
    });
    await controller.create(req, res);
    expect(res.statusCode).toBe(201);
  });

  it('allows open → applied', async () => {
    mockModel.findById
      .mockResolvedValueOnce({ id: 'cm-1', status: 'open', amount: '500', ap_invoice_id: 'inv-1' })
      .mockResolvedValueOnce({ id: 'inv-1', balance_due: '3000' });
    mockModel.updateWhere.mockResolvedValueOnce(1);

    const { req, res } = mockReqRes({ query: { id: 'cm-1' }, body: { status: 'applied' } });
    await controller.update(req, res);
    expect(res.body.updatedRecords).toBe(1);
  });

  it('allows open → voided', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'cm-1', status: 'open', amount: '500' });
    mockModel.updateWhere.mockResolvedValueOnce(1);
    const { req, res } = mockReqRes({ query: { id: 'cm-1' }, body: { status: 'voided' } });
    await controller.update(req, res);
    expect(res.body.updatedRecords).toBe(1);
  });

  it('allows applied → voided', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'cm-1', status: 'applied', amount: '500' });
    mockModel.updateWhere.mockResolvedValueOnce(1);
    const { req, res } = mockReqRes({ query: { id: 'cm-1' }, body: { status: 'voided' } });
    await controller.update(req, res);
    expect(res.body.updatedRecords).toBe(1);
  });

  it('rejects open → paid (invalid target)', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'cm-1', status: 'open', amount: '500' });
    const { req, res } = mockReqRes({ query: { id: 'cm-1' }, body: { status: 'paid' } });
    await controller.update(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Invalid status transition');
  });

  it('rejects transitions from voided', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'cm-1', status: 'voided', amount: '500' });
    const { req, res } = mockReqRes({ query: { id: 'cm-1' }, body: { status: 'open' } });
    await controller.update(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Invalid status transition');
  });

  it('returns 404 for missing credit memo on status update', async () => {
    mockModel.findById.mockResolvedValueOnce(null);
    const { req, res } = mockReqRes({ query: { id: 'missing' }, body: { status: 'applied' } });
    await controller.update(req, res);
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toContain('not found');
  });

  it('reduces invoice balance when credit memo applied', async () => {
    mockModel.findById
      .mockResolvedValueOnce({ id: 'cm-1', status: 'open', amount: '500', ap_invoice_id: 'inv-1' })
      .mockResolvedValueOnce({ id: 'inv-1', balance_due: '3000' });
    mockModel.updateWhere.mockResolvedValueOnce(1);

    const { req, res } = mockReqRes({ query: { id: 'cm-1' }, body: { status: 'applied' } });
    await controller.update(req, res);

    // db.none should have been called to reduce balance
    const { default: db } = await import('../../src/db/db.js');
    expect(db.none).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE'),
      [2500, 'inv-1'],
    );
  });

  it('clamps invoice balance to 0 when credit exceeds balance', async () => {
    mockModel.findById
      .mockResolvedValueOnce({ id: 'cm-2', status: 'open', amount: '5000', ap_invoice_id: 'inv-2' })
      .mockResolvedValueOnce({ id: 'inv-2', balance_due: '3000' });
    mockModel.updateWhere.mockResolvedValueOnce(1);

    const { req, res } = mockReqRes({ query: { id: 'cm-2' }, body: { status: 'applied' } });
    await controller.update(req, res);

    const { default: db } = await import('../../src/db/db.js');
    expect(db.none).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE'),
      [0, 'inv-2'],
    );
  });
});
