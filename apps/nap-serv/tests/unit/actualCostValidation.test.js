/**
 * @file Unit tests for actual cost approval workflow
 * @module tests/unit/actualCostValidation
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
  return { default: proxy, db: proxy };
});

vi.mock('../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const { ActualCostsController, VALID_TRANSITIONS } = await import(
  '../../Modules/activities/controllers/actualCostsController.js'
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

describe('Actual Cost Approval Workflow', () => {
  let controller;

  beforeEach(() => {
    controller = new ActualCostsController();
    vi.clearAllMocks();
  });

  it('defines valid transition map', () => {
    expect(VALID_TRANSITIONS.pending).toEqual(['approved', 'rejected']);
    expect(VALID_TRANSITIONS.approved).toEqual([]);
    expect(VALID_TRANSITIONS.rejected).toEqual([]);
  });

  it('rejects invalid approval_status on create', async () => {
    const { req, res } = mockReqRes({ body: { approval_status: 'bogus' } });
    await controller.create(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Invalid approval status');
  });

  it('allows valid create with default pending status', async () => {
    mockModel.insert.mockResolvedValueOnce({ id: 'ac1', approval_status: 'pending' });
    const { req, res } = mockReqRes({
      body: { activity_id: 'a1', amount: '150.00', approval_status: 'pending' },
    });
    await controller.create(req, res);
    expect(res.statusCode).toBe(201);
  });

  it('allows pending → approved', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'ac1', approval_status: 'pending' });
    mockModel.updateWhere.mockResolvedValueOnce(1);
    const { req, res } = mockReqRes({ query: { id: 'ac1' }, body: { approval_status: 'approved' } });
    await controller.update(req, res);
    expect(res.body.updatedRecords).toBe(1);
  });

  it('allows pending → rejected', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'ac1', approval_status: 'pending' });
    mockModel.updateWhere.mockResolvedValueOnce(1);
    const { req, res } = mockReqRes({ query: { id: 'ac1' }, body: { approval_status: 'rejected' } });
    await controller.update(req, res);
    expect(res.body.updatedRecords).toBe(1);
  });

  it('rejects transition from approved', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'ac1', approval_status: 'approved' });
    const { req, res } = mockReqRes({ query: { id: 'ac1' }, body: { approval_status: 'pending' } });
    await controller.update(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Invalid approval status transition');
  });

  it('rejects transition from rejected', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'ac1', approval_status: 'rejected' });
    const { req, res } = mockReqRes({ query: { id: 'ac1' }, body: { approval_status: 'approved' } });
    await controller.update(req, res);
    expect(res.statusCode).toBe(400);
  });
});
