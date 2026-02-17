/**
 * @file Unit tests for deliverable status workflow and budget gate
 * @module tests/unit/deliverableWorkflow
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

const { DeliverablesController, VALID_TRANSITIONS } = await import(
  '../../Modules/activities/controllers/deliverablesController.js'
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

describe('Deliverable Status Workflow', () => {
  let controller;

  beforeEach(() => {
    controller = new DeliverablesController();
    vi.clearAllMocks();
  });

  it('defines valid transition map', () => {
    expect(VALID_TRANSITIONS.pending).toEqual(['released', 'canceled']);
    expect(VALID_TRANSITIONS.released).toEqual(['finished', 'canceled']);
    expect(VALID_TRANSITIONS.finished).toEqual([]);
    expect(VALID_TRANSITIONS.canceled).toEqual([]);
  });

  it('rejects invalid status on create', async () => {
    const { req, res } = mockReqRes({ body: { status: 'bogus' } });
    await controller.create(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Invalid deliverable status');
  });

  it('allows valid status on create', async () => {
    mockModel.insert.mockResolvedValueOnce({ id: 'd1', status: 'pending' });
    const { req, res } = mockReqRes({
      body: { tenant_id: 'tid', name: 'Test Deliverable', status: 'pending' },
    });
    await controller.create(req, res);
    expect(res.statusCode).toBe(201);
  });

  it('rejects pending → finished (must go through released)', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'd1', status: 'pending' });
    const { req, res } = mockReqRes({ query: { id: 'd1' }, body: { status: 'finished' } });
    await controller.update(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Invalid status transition');
  });

  it('blocks release when no approved budget exists', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'd1', status: 'pending' });
    // findWhere returns empty — no approved budgets
    mockModel.findWhere.mockResolvedValueOnce([]);
    const { req, res } = mockReqRes({ query: { id: 'd1' }, body: { status: 'released' } });
    await controller.update(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('no approved budget');
  });

  it('allows release when approved budget exists', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'd1', status: 'pending' });
    // findWhere returns an approved budget
    mockModel.findWhere.mockResolvedValueOnce([{ id: 'b1', status: 'approved', is_current: true }]);
    mockModel.updateWhere.mockResolvedValueOnce(1);
    const { req, res } = mockReqRes({ query: { id: 'd1' }, body: { status: 'released' } });
    await controller.update(req, res);
    expect(res.body.updatedRecords).toBe(1);
  });

  it('allows released → finished', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'd1', status: 'released' });
    mockModel.updateWhere.mockResolvedValueOnce(1);
    const { req, res } = mockReqRes({ query: { id: 'd1' }, body: { status: 'finished' } });
    await controller.update(req, res);
    expect(res.body.updatedRecords).toBe(1);
  });

  it('allows pending → canceled', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'd1', status: 'pending' });
    mockModel.updateWhere.mockResolvedValueOnce(1);
    const { req, res } = mockReqRes({ query: { id: 'd1' }, body: { status: 'canceled' } });
    await controller.update(req, res);
    expect(res.body.updatedRecords).toBe(1);
  });

  it('rejects transitions from finished', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'd1', status: 'finished' });
    const { req, res } = mockReqRes({ query: { id: 'd1' }, body: { status: 'pending' } });
    await controller.update(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('rejects transitions from canceled', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'd1', status: 'canceled' });
    const { req, res } = mockReqRes({ query: { id: 'd1' }, body: { status: 'pending' } });
    await controller.update(req, res);
    expect(res.statusCode).toBe(400);
  });
});
