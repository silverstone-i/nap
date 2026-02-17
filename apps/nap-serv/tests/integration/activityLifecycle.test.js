/**
 * @file Integration test — full activity lifecycle: category → activity → deliverable → budget → cost lines → actual costs
 * @module tests/integration/activityLifecycle
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

const { CategoriesController } = await import('../../Modules/activities/controllers/categoriesController.js');
const { ActivitiesController } = await import('../../Modules/activities/controllers/activitiesController.js');
const { DeliverablesController } = await import('../../Modules/activities/controllers/deliverablesController.js');
const { BudgetsController } = await import('../../Modules/activities/controllers/budgetsController.js');
const { CostLinesController } = await import('../../Modules/activities/controllers/costLinesController.js');
const { ActualCostsController } = await import('../../Modules/activities/controllers/actualCostsController.js');

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

describe('Activity Lifecycle Integration', () => {
  let categoriesCtrl, activitiesCtrl, deliverablesCtrl, budgetsCtrl, costLinesCtrl, actualCostsCtrl;

  beforeEach(() => {
    categoriesCtrl = new CategoriesController();
    activitiesCtrl = new ActivitiesController();
    deliverablesCtrl = new DeliverablesController();
    budgetsCtrl = new BudgetsController();
    costLinesCtrl = new CostLinesController();
    actualCostsCtrl = new ActualCostsController();
    insertCallLog = [];
    updateWhereCallLog = [];
    findByIdStore = {};
    vi.clearAllMocks();
    mockModel.findById.mockImplementation((id) => Promise.resolve(findByIdStore[id] || null));
    mockModel.insert.mockImplementation((data) => {
      const id = `id-${insertCallLog.length + 1}`;
      const record = { id, ...data };
      insertCallLog.push(record);
      findByIdStore[id] = record;
      return Promise.resolve(record);
    });
  });

  it('full flow: category → activity → deliverable → budget approval → cost lines → actual costs', async () => {
    // 1. Create category
    const { req: catReq, res: catRes } = mockReqRes({
      body: { tenant_id: 'tid', code: 'FRAME', name: 'Framing', type: 'labor' },
    });
    await categoriesCtrl.create(catReq, catRes);
    expect(catRes.statusCode).toBe(201);
    const categoryId = catRes.body.id;

    // 2. Create activity
    const { req: actReq, res: actRes } = mockReqRes({
      body: { tenant_id: 'tid', category_id: categoryId, code: 'FRAME-01', name: 'Rough Framing' },
    });
    await activitiesCtrl.create(actReq, actRes);
    expect(actRes.statusCode).toBe(201);
    const activityId = actRes.body.id;

    // 3. Create deliverable
    const { req: delReq, res: delRes } = mockReqRes({
      body: { tenant_id: 'tid', name: 'Phase 1 Framing', status: 'pending' },
    });
    await deliverablesCtrl.create(delReq, delRes);
    expect(delRes.statusCode).toBe(201);
    const deliverableId = delRes.body.id;

    // 4. Create budget (draft)
    const { req: budReq, res: budRes } = mockReqRes({
      body: {
        deliverable_id: deliverableId, activity_id: activityId,
        budgeted_amount: '10000', version: 1, status: 'draft',
      },
    });
    await budgetsCtrl.create(budReq, budRes);
    expect(budRes.statusCode).toBe(201);
    const budgetId = budRes.body.id;

    // 5. Submit budget
    const { req: submitReq, res: submitRes } = mockReqRes({
      query: { id: budgetId }, body: { status: 'submitted' },
    });
    mockModel.updateWhere.mockResolvedValueOnce(1);
    await budgetsCtrl.update(submitReq, submitRes);
    expect(submitRes.body.updatedRecords).toBe(1);
    findByIdStore[budgetId].status = 'submitted';

    // 6. Approve budget
    const { req: appReq, res: appRes } = mockReqRes({
      query: { id: budgetId }, body: { status: 'approved' },
    });
    mockModel.updateWhere.mockResolvedValueOnce(1);
    await budgetsCtrl.update(appReq, appRes);
    expect(appRes.body.updatedRecords).toBe(1);
    findByIdStore[budgetId].status = 'approved';

    // 7. Release deliverable (should succeed — approved budget exists)
    mockModel.findWhere.mockResolvedValueOnce([findByIdStore[budgetId]]);
    const { req: relReq, res: relRes } = mockReqRes({
      query: { id: deliverableId }, body: { status: 'released' },
    });
    mockModel.updateWhere.mockResolvedValueOnce(1);
    await deliverablesCtrl.update(relReq, relRes);
    expect(relRes.body.updatedRecords).toBe(1);
    findByIdStore[deliverableId].status = 'released';

    // 8. Create cost line
    const { req: clReq, res: clRes } = mockReqRes({
      body: {
        company_id: 'c1', deliverable_id: deliverableId, activity_id: activityId,
        budget_id: budgetId, source_type: 'labor', quantity: 40, unit_price: 75,
        status: 'draft',
      },
    });
    await costLinesCtrl.create(clReq, clRes);
    expect(clRes.statusCode).toBe(201);

    // 9. Record actual cost
    const { req: acReq, res: acRes } = mockReqRes({
      body: {
        activity_id: activityId, project_id: 'p1', amount: '3000.00',
        currency: 'USD', reference: 'INV-001', approval_status: 'pending',
        incurred_on: '2025-03-15',
      },
    });
    await actualCostsCtrl.create(acReq, acRes);
    expect(acRes.statusCode).toBe(201);
    const actualCostId = acRes.body.id;

    // 10. Approve actual cost
    const { req: acAppReq, res: acAppRes } = mockReqRes({
      query: { id: actualCostId }, body: { approval_status: 'approved' },
    });
    mockModel.updateWhere.mockResolvedValueOnce(1);
    await actualCostsCtrl.update(acAppReq, acAppRes);
    expect(acAppRes.body.updatedRecords).toBe(1);
  });

  it('blocks deliverable release without approved budget', async () => {
    // Create deliverable
    const { req: delReq, res: delRes } = mockReqRes({
      body: { tenant_id: 'tid', name: 'Unbudgeted Work', status: 'pending' },
    });
    await deliverablesCtrl.create(delReq, delRes);
    expect(delRes.statusCode).toBe(201);
    const deliverableId = delRes.body.id;

    // Attempt release with no approved budget
    mockModel.findWhere.mockResolvedValueOnce([]);
    const { req: relReq, res: relRes } = mockReqRes({
      query: { id: deliverableId }, body: { status: 'released' },
    });
    await deliverablesCtrl.update(relReq, relRes);
    expect(relRes.statusCode).toBe(400);
    expect(relRes.body.error).toContain('no approved budget');
  });

  it('budget versioning: approved budget spawns new draft version', async () => {
    // Create and approve a budget
    const { req: budReq, res: budRes } = mockReqRes({
      body: {
        deliverable_id: 'd1', activity_id: 'a1',
        budgeted_amount: '5000', version: 1, status: 'approved',
        is_current: true,
      },
    });
    await budgetsCtrl.create(budReq, budRes);
    expect(budRes.statusCode).toBe(201);
    const budgetId = budRes.body.id;

    // Manually set status to approved in store (mock doesn't apply transitions)
    findByIdStore[budgetId].status = 'approved';

    // Create new version
    mockModel.insert.mockImplementationOnce((data) => {
      const id = `id-${insertCallLog.length + 1}`;
      const record = { id, ...data };
      insertCallLog.push(record);
      findByIdStore[id] = record;
      return Promise.resolve(record);
    });

    const { req: vReq, res: vRes } = mockReqRes({ body: { budget_id: budgetId } });
    await budgetsCtrl.createNewVersion(vReq, vRes);
    expect(vRes.statusCode).toBe(201);
    expect(vRes.body.version).toBe(2);
    expect(vRes.body.status).toBe('draft');
    expect(vRes.body.is_current).toBe(true);
  });
});
