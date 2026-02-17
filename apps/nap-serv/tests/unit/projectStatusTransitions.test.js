/**
 * @file Unit tests for project status transition validation
 * @module tests/unit/projectStatusTransitions
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

const { ProjectsController, VALID_TRANSITIONS } = await import(
  '../../Modules/projects/controllers/projectsController.js'
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

describe('Project Status Transitions', () => {
  let controller;

  beforeEach(() => {
    controller = new ProjectsController();
    vi.clearAllMocks();
  });

  it('defines valid transition map', () => {
    expect(VALID_TRANSITIONS.planning).toEqual(['budgeting']);
    expect(VALID_TRANSITIONS.budgeting).toEqual(['released']);
    expect(VALID_TRANSITIONS.released).toEqual(['complete']);
    expect(VALID_TRANSITIONS.complete).toEqual([]);
  });

  it('rejects invalid status on create', async () => {
    const { req, res } = mockReqRes({ body: { status: 'invalid_status' } });
    await controller.create(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Invalid project status');
  });

  it('allows valid status on create', async () => {
    mockModel.insert.mockResolvedValueOnce({ id: 'p1', status: 'planning' });
    const { req, res } = mockReqRes({ body: { name: 'Test', project_code: 'T1', tenant_id: 'tid', status: 'planning' } });
    await controller.create(req, res);
    expect(res.statusCode).toBe(201);
  });

  it('rejects invalid transition on update (planning → complete)', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'p1', status: 'planning' });
    const { req, res } = mockReqRes({ query: { id: 'p1' }, body: { status: 'complete' } });
    await controller.update(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Invalid status transition');
  });

  it('allows valid transition (planning → budgeting)', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'p1', status: 'planning' });
    mockModel.updateWhere.mockResolvedValueOnce(1);
    const { req, res } = mockReqRes({ query: { id: 'p1' }, body: { status: 'budgeting' } });
    await controller.update(req, res);
    expect(res.body.updatedRecords).toBe(1);
  });

  it('allows valid transition (budgeting → released)', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'p1', status: 'budgeting' });
    mockModel.updateWhere.mockResolvedValueOnce(1);
    const { req, res } = mockReqRes({ query: { id: 'p1' }, body: { status: 'released' } });
    await controller.update(req, res);
    expect(res.body.updatedRecords).toBe(1);
  });

  it('rejects transition from complete', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'p1', status: 'complete' });
    const { req, res } = mockReqRes({ query: { id: 'p1' }, body: { status: 'planning' } });
    await controller.update(req, res);
    expect(res.statusCode).toBe(400);
  });
});
