/**
 * @file Unit tests for ViewController and BaseController
 * @module tests/unit/baseController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db module
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

const { default: ViewController } = await import('../../src/lib/ViewController.js');
const { default: BaseController } = await import('../../src/lib/BaseController.js');

function mockReqRes({ method = 'GET', user = null, body = {}, query = {}, params = {}, ctx = {} } = {}) {
  const req = {
    method,
    user: user || { id: 'u1', tenant_code: 'NAP', schema_name: 'nap' },
    body,
    query,
    params,
    ctx: { schema: 'admin', ...ctx },
  };
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  return { req, res };
}

describe('ViewController', () => {
  it('should throw if modelName is not a string', () => {
    expect(() => new ViewController(123)).toThrow('Invalid model name');
  });

  it('should resolve schema from req.ctx.schema', () => {
    const vc = new ViewController('tenants');
    const { req } = mockReqRes();
    expect(vc.getSchema(req)).toBe('admin');
  });

  it('should throw if no schema can be resolved', () => {
    const vc = new ViewController('tenants');
    const { req } = mockReqRes({ ctx: {}, user: {} });
    req.ctx = {};
    req.user = {};
    expect(() => vc.getSchema(req)).toThrow('schemaName is required');
  });
});

describe('BaseController', () => {
  let bc;

  beforeEach(() => {
    bc = new BaseController('tenants');
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should insert and return 201', async () => {
      mockModel.insert.mockResolvedValueOnce({ id: 'new-tenant', company: 'Test' });
      const { req, res } = mockReqRes({ body: { company: 'Test' } });
      await bc.create(req, res);
      expect(res.statusCode).toBe(201);
      expect(res.body.id).toBe('new-tenant');
    });
  });

  describe('update', () => {
    it('should update and return count', async () => {
      mockModel.updateWhere.mockResolvedValueOnce(2);
      const { req, res } = mockReqRes({ query: { status: 'active' }, body: { tier: 'growth' } });
      await bc.update(req, res);
      expect(res.body.updatedRecords).toBe(2);
    });

    it('should return 404 when no records updated', async () => {
      mockModel.updateWhere.mockResolvedValueOnce(0);
      const { req, res } = mockReqRes({ query: { id: 'missing' }, body: {} });
      await bc.update(req, res);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('archive', () => {
    it('should soft-delete and return success', async () => {
      mockModel.updateWhere.mockResolvedValueOnce(1);
      const { req, res } = mockReqRes({ query: { id: 't1' }, body: {} });
      await bc.archive(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('inactive');
    });

    it('should return 404 when not found', async () => {
      mockModel.updateWhere.mockResolvedValueOnce(0);
      const { req, res } = mockReqRes({ query: { id: 'missing' }, body: {} });
      await bc.archive(req, res);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('restore', () => {
    it('should reactivate and return success', async () => {
      mockModel.updateWhere.mockResolvedValueOnce(1);
      const { req, res } = mockReqRes({ query: { id: 't1' }, body: {} });
      await bc.restore(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('active');
    });

    it('should return 404 when not found', async () => {
      mockModel.updateWhere.mockResolvedValueOnce(0);
      const { req, res } = mockReqRes({ query: { id: 'missing' }, body: {} });
      await bc.restore(req, res);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('getById', () => {
    it('should return 404 when record not found', async () => {
      mockModel.findById.mockResolvedValueOnce(null);
      const { req, res } = mockReqRes({ params: { id: 'missing' } });
      await bc.getById(req, res);
      expect(res.statusCode).toBe(404);
    });

    it('should return the record when found', async () => {
      mockModel.findById.mockResolvedValueOnce({ id: 't1', company: 'Test' });
      const { req, res } = mockReqRes({ params: { id: 't1' } });
      await bc.getById(req, res);
      expect(res.body.id).toBe('t1');
    });
  });

  describe('bulkInsert', () => {
    it('should insert and return 201', async () => {
      mockModel.bulkInsert.mockResolvedValueOnce([{ id: '1' }, { id: '2' }]);
      const { req, res } = mockReqRes({ body: [{ name: 'a' }, { name: 'b' }] });
      await bc.bulkInsert(req, res);
      expect(res.statusCode).toBe(201);
    });
  });
});
