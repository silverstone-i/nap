/**
 * @file Unit tests for budget version management and approval workflow
 * @module tests/unit/budgetVersionWorkflow
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

const { BudgetsController, VALID_TRANSITIONS } = await import(
  '../../Modules/activities/controllers/budgetsController.js'
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

describe('Budget Version & Approval Workflow', () => {
  let controller;

  beforeEach(() => {
    controller = new BudgetsController();
    vi.clearAllMocks();
  });

  it('defines valid transition map', () => {
    expect(VALID_TRANSITIONS.draft).toEqual(['submitted']);
    expect(VALID_TRANSITIONS.submitted).toEqual(['approved', 'rejected']);
    expect(VALID_TRANSITIONS.approved).toEqual(['locked']);
    expect(VALID_TRANSITIONS.locked).toEqual([]);
    expect(VALID_TRANSITIONS.rejected).toEqual([]);
  });

  it('rejects invalid status on create', async () => {
    const { req, res } = mockReqRes({ body: { status: 'bogus' } });
    await controller.create(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Invalid budget status');
  });

  it('allows valid status on create', async () => {
    mockModel.insert.mockResolvedValueOnce({ id: 'b1', status: 'draft' });
    const { req, res } = mockReqRes({
      body: { deliverable_id: 'd1', activity_id: 'a1', budgeted_amount: '5000', status: 'draft' },
    });
    await controller.create(req, res);
    expect(res.statusCode).toBe(201);
  });

  it('allows draft → submitted and sets submitted_by/at', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'b1', status: 'draft', version: 1 });
    mockModel.updateWhere.mockResolvedValueOnce(1);
    const { req, res } = mockReqRes({ query: { id: 'b1' }, body: { status: 'submitted' } });
    await controller.update(req, res);
    expect(res.body.updatedRecords).toBe(1);
    // Verify submitted_by was set on req.body
    expect(req.body.submitted_by).toBe('u1');
    expect(req.body.submitted_at).toBeDefined();
  });

  it('allows submitted → approved and sets approved_by/at', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'b1', status: 'submitted', version: 1 });
    mockModel.updateWhere.mockResolvedValueOnce(1);
    const { req, res } = mockReqRes({ query: { id: 'b1' }, body: { status: 'approved' } });
    await controller.update(req, res);
    expect(res.body.updatedRecords).toBe(1);
    expect(req.body.approved_by).toBe('u1');
    expect(req.body.approved_at).toBeDefined();
  });

  it('rejects draft → approved (skip submitted)', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'b1', status: 'draft', version: 1 });
    const { req, res } = mockReqRes({ query: { id: 'b1' }, body: { status: 'approved' } });
    await controller.update(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Invalid status transition');
  });

  it('rejects field changes on approved budgets', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'b1', status: 'approved', version: 1 });
    const { req, res } = mockReqRes({
      query: { id: 'b1' },
      body: { status: 'draft', budgeted_amount: '9999' },
    });
    await controller.update(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('read-only');
  });

  it('allows approved → locked', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'b1', status: 'approved', version: 1 });
    mockModel.updateWhere.mockResolvedValueOnce(1);
    const { req, res } = mockReqRes({ query: { id: 'b1' }, body: { status: 'locked' } });
    await controller.update(req, res);
    expect(res.body.updatedRecords).toBe(1);
  });

  it('rejects transitions from locked', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'b1', status: 'locked', version: 1 });
    const { req, res } = mockReqRes({ query: { id: 'b1' }, body: { status: 'draft' } });
    await controller.update(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('rejects transitions from rejected', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'b1', status: 'rejected', version: 1 });
    const { req, res } = mockReqRes({ query: { id: 'b1' }, body: { status: 'submitted' } });
    await controller.update(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('createNewVersion requires budget_id', async () => {
    const { req, res } = mockReqRes({ body: {} });
    await controller.createNewVersion(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('budget_id is required');
  });

  it('createNewVersion rejects non-approved/locked budgets', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'b1', status: 'draft', version: 1 });
    const { req, res } = mockReqRes({ body: { budget_id: 'b1' } });
    await controller.createNewVersion(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Only approved or locked');
  });

  it('createNewVersion creates a new draft version from approved budget', async () => {
    mockModel.findById.mockResolvedValueOnce({
      id: 'b1', status: 'approved', version: 2,
      deliverable_id: 'd1', activity_id: 'a1', budgeted_amount: '5000',
    });
    mockModel.insert.mockResolvedValueOnce({
      id: 'b2', deliverable_id: 'd1', activity_id: 'a1',
      budgeted_amount: '5000', version: 3, is_current: true, status: 'draft',
    });

    const { req, res } = mockReqRes({ body: { budget_id: 'b1' } });
    await controller.createNewVersion(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.version).toBe(3);
    expect(res.body.status).toBe('draft');
    expect(res.body.is_current).toBe(true);
  });
});
