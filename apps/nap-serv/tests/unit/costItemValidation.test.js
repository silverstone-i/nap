/**
 * @file Unit tests for cost item enum validation
 * @module tests/unit/costItemValidation
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

const { CostItemsController, VALID_COST_CLASSES, VALID_COST_SOURCES } = await import(
  '../../Modules/projects/controllers/costItemsController.js'
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

describe('Cost Item Validation', () => {
  let controller;

  beforeEach(() => {
    controller = new CostItemsController();
    vi.clearAllMocks();
  });

  it('exports valid cost class values', () => {
    expect(VALID_COST_CLASSES).toEqual(['labor', 'material', 'subcontract', 'equipment', 'other']);
  });

  it('exports valid cost source values', () => {
    expect(VALID_COST_SOURCES).toEqual(['budget', 'change_order']);
  });

  it('rejects invalid cost_class on create', async () => {
    const { req, res } = mockReqRes({ body: { cost_class: 'invalid', cost_source: 'budget' } });
    await controller.create(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Invalid cost_class');
  });

  it('rejects invalid cost_source on create', async () => {
    const { req, res } = mockReqRes({ body: { cost_class: 'labor', cost_source: 'invalid' } });
    await controller.create(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Invalid cost_source');
  });

  it('allows valid enums on create', async () => {
    mockModel.insert.mockResolvedValueOnce({ id: 'ci1', cost_class: 'labor', cost_source: 'budget' });
    const { req, res } = mockReqRes({
      body: { task_id: 't1', cost_class: 'labor', cost_source: 'budget', quantity: 10, unit_cost: 50 },
    });
    await controller.create(req, res);
    expect(res.statusCode).toBe(201);
  });

  it('rejects invalid cost_class on update', async () => {
    const { req, res } = mockReqRes({ query: { id: 'ci1' }, body: { cost_class: 'bad' } });
    await controller.update(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('allows valid enums on update', async () => {
    mockModel.updateWhere.mockResolvedValueOnce(1);
    const { req, res } = mockReqRes({ query: { id: 'ci1' }, body: { cost_class: 'equipment' } });
    await controller.update(req, res);
    expect(res.body.updatedRecords).toBe(1);
  });
});
