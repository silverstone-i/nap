/**
 * @file Integration test — full project lifecycle: create → units → tasks → cost items → change orders
 * @module tests/integration/projectLifecycle
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

let insertCallLog = [];
let updateWhereCallLog = [];
let findByIdStore = {};

const mockModel = {
  findAfterCursor: vi.fn().mockResolvedValue({ data: [], hasMore: false }),
  findById: vi.fn((id) => Promise.resolve(findByIdStore[id] || null)),
  findWhere: vi.fn().mockResolvedValue([]),
  countWhere: vi.fn().mockResolvedValue(0),
  insert: vi.fn((data) => {
    const id = `id-${insertCallLog.length + 1}`;
    const record = { id, ...data };
    insertCallLog.push(record);
    findByIdStore[id] = record;
    return Promise.resolve(record);
  }),
  updateWhere: vi.fn((filters, data) => {
    updateWhereCallLog.push({ filters, data });
    // Simulate updating the store
    const id = filters[0]?.id;
    if (id && findByIdStore[id]) {
      Object.assign(findByIdStore[id], data);
    }
    return Promise.resolve(1);
  }),
  bulkInsert: vi.fn().mockResolvedValue([]),
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

const { ProjectsController } = await import('../../Modules/projects/controllers/projectsController.js');
const { CostItemsController } = await import('../../Modules/projects/controllers/costItemsController.js');
const { ChangeOrdersController } = await import('../../Modules/projects/controllers/changeOrdersController.js');

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

describe('Project Lifecycle Integration', () => {
  let projectsCtrl;
  let costItemsCtrl;
  let changeOrdersCtrl;

  beforeEach(() => {
    projectsCtrl = new ProjectsController();
    costItemsCtrl = new CostItemsController();
    changeOrdersCtrl = new ChangeOrdersController();
    insertCallLog = [];
    updateWhereCallLog = [];
    findByIdStore = {};
    vi.clearAllMocks();
    // Re-bind findById to use store
    mockModel.findById.mockImplementation((id) => Promise.resolve(findByIdStore[id] || null));
    mockModel.insert.mockImplementation((data) => {
      const id = `id-${insertCallLog.length + 1}`;
      const record = { id, ...data };
      insertCallLog.push(record);
      findByIdStore[id] = record;
      return Promise.resolve(record);
    });
  });

  it('creates a project and transitions through full lifecycle', async () => {
    // 1. Create project (include status since mock doesn't apply schema defaults)
    const { req: createReq, res: createRes } = mockReqRes({
      body: { tenant_id: 'tid', project_code: 'P001', name: 'Test Project', contract_amount: '100000.00', status: 'planning' },
    });
    await projectsCtrl.create(createReq, createRes);
    expect(createRes.statusCode).toBe(201);
    const projectId = createRes.body.id;

    // 2. Transition planning → budgeting
    const { req: budgetReq, res: budgetRes } = mockReqRes({
      query: { id: projectId },
      body: { status: 'budgeting' },
    });
    mockModel.updateWhere.mockResolvedValueOnce(1);
    await projectsCtrl.update(budgetReq, budgetRes);
    expect(budgetRes.body.updatedRecords).toBe(1);

    // Update store manually for next transition
    findByIdStore[projectId].status = 'budgeting';

    // 3. Transition budgeting → released
    const { req: releaseReq, res: releaseRes } = mockReqRes({
      query: { id: projectId },
      body: { status: 'released' },
    });
    mockModel.updateWhere.mockResolvedValueOnce(1);
    await projectsCtrl.update(releaseReq, releaseRes);
    expect(releaseRes.body.updatedRecords).toBe(1);

    findByIdStore[projectId].status = 'released';

    // 4. Transition released → complete
    const { req: completeReq, res: completeRes } = mockReqRes({
      query: { id: projectId },
      body: { status: 'complete' },
    });
    mockModel.updateWhere.mockResolvedValueOnce(1);
    await projectsCtrl.update(completeReq, completeRes);
    expect(completeRes.body.updatedRecords).toBe(1);
  });

  it('creates cost items with valid enums and creates/approves a change order', async () => {
    // Create a cost item
    const { req: ciReq, res: ciRes } = mockReqRes({
      body: { task_id: 't1', cost_class: 'labor', cost_source: 'budget', quantity: 10, unit_cost: 50 },
    });
    await costItemsCtrl.create(ciReq, ciRes);
    expect(ciRes.statusCode).toBe(201);

    // Create a change order (include status since mock doesn't apply schema defaults)
    const { req: coReq, res: coRes } = mockReqRes({
      body: { unit_id: 'u1', co_number: 'CO-001', title: 'Extra framing', total_amount: '5000.00', status: 'draft' },
    });
    await changeOrdersCtrl.create(coReq, coRes);
    expect(coRes.statusCode).toBe(201);
    const coId = coRes.body.id;

    // Submit the change order
    const { req: submitReq, res: submitRes } = mockReqRes({
      query: { id: coId },
      body: { status: 'submitted' },
    });
    mockModel.updateWhere.mockResolvedValueOnce(1);
    await changeOrdersCtrl.update(submitReq, submitRes);
    expect(submitRes.body.updatedRecords).toBe(1);

    // Update store for approval
    findByIdStore[coId].status = 'submitted';

    // Approve the change order
    const { req: approveReq, res: approveRes } = mockReqRes({
      query: { id: coId },
      body: { status: 'approved' },
    });
    mockModel.updateWhere.mockResolvedValueOnce(1);
    await changeOrdersCtrl.update(approveReq, approveRes);
    expect(approveRes.body.updatedRecords).toBe(1);
  });
});
