/**
 * @file Unit tests for cost line source_type validation and status transitions
 * @module tests/unit/costLineValidation
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

const { CostLinesController, VALID_SOURCE_TYPES, VALID_TRANSITIONS } = await import(
  '../../Modules/activities/controllers/costLinesController.js'
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

describe('Cost Line Validation', () => {
  let controller;

  beforeEach(() => {
    controller = new CostLinesController();
    vi.clearAllMocks();
  });

  it('exports valid source types', () => {
    expect(VALID_SOURCE_TYPES).toEqual(['material', 'labor']);
  });

  it('exports valid status transitions', () => {
    expect(VALID_TRANSITIONS.draft).toEqual(['locked']);
    expect(VALID_TRANSITIONS.locked).toEqual(['change_order']);
    expect(VALID_TRANSITIONS.change_order).toEqual([]);
  });

  it('rejects invalid source_type on create', async () => {
    const { req, res } = mockReqRes({ body: { source_type: 'invalid' } });
    await controller.create(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Invalid source_type');
  });

  it('rejects invalid status on create', async () => {
    const { req, res } = mockReqRes({ body: { source_type: 'labor', status: 'bogus' } });
    await controller.create(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Invalid cost line status');
  });

  it('allows valid create', async () => {
    mockModel.insert.mockResolvedValueOnce({ id: 'cl1', source_type: 'material', status: 'draft' });
    const { req, res } = mockReqRes({
      body: {
        company_id: 'c1', deliverable_id: 'd1', activity_id: 'a1',
        source_type: 'material', quantity: 10, unit_price: 25, status: 'draft',
      },
    });
    await controller.create(req, res);
    expect(res.statusCode).toBe(201);
  });

  it('rejects invalid source_type on update', async () => {
    const { req, res } = mockReqRes({ query: { id: 'cl1' }, body: { source_type: 'bad' } });
    await controller.update(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid status transition (draft → change_order)', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'cl1', status: 'draft' });
    const { req, res } = mockReqRes({ query: { id: 'cl1' }, body: { status: 'change_order' } });
    await controller.update(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Invalid status transition');
  });

  it('allows draft → locked', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'cl1', status: 'draft' });
    mockModel.updateWhere.mockResolvedValueOnce(1);
    const { req, res } = mockReqRes({ query: { id: 'cl1' }, body: { status: 'locked' } });
    await controller.update(req, res);
    expect(res.body.updatedRecords).toBe(1);
  });

  it('allows locked → change_order', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'cl1', status: 'locked' });
    mockModel.updateWhere.mockResolvedValueOnce(1);
    const { req, res } = mockReqRes({ query: { id: 'cl1' }, body: { status: 'change_order' } });
    await controller.update(req, res);
    expect(res.body.updatedRecords).toBe(1);
  });
});
