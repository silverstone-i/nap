import { randomUUID } from 'crypto';
import runMigrate from '../../../scripts/runMigrate.js';

beforeAll(async () => {
  const schemaList = ['admin', 'tenantid'];

  for (const schema of schemaList) {
    if (schema !== 'public') {
      await db.none(`DROP SCHEMA IF EXISTS ${schema} CASCADE; CREATE SCHEMA ${schema};`);
    }
  }

  await runMigrate(db, { schemas: schemaList }, true);
});

afterAll(async () => {
  await db.$pool.end();
});

/**
 * Real-model integration tests for UnitBudgetsController logic.
 */

import { jest } from '@jest/globals';
import { UnitBudgetsController } from '../../../modules/activities/controllers/UnitBudgetsController.js';
import schema from '../../../modules/activities/schemas/UnitBudgetsSchema.js';
import { db, pgp } from '../../../src/db/db.js';
import { TableModel } from 'pg-schemata';
import { mockReq, mockRes } from '../../util/mockHelpers.js';

describe('UnitBudgetsController (real model)', () => {
  let inserted, unit, activity, category;
  const model = new TableModel(db, pgp, schema);
  const controller = new UnitBudgetsController();
  controller.model = model;

  beforeEach(async () => {
    unit = await db.one(`
      INSERT INTO tenantid.units (id, tenant_id, name, unit_code, status)
      VALUES ($1, $2, 'Unit One', 'UNIT01', 'pending')
      RETURNING *;
    `, ['11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000']);

    const categoryId = randomUUID();
    category = await db.one(`
      INSERT INTO tenantid.categories (id, tenant_id, category_id, name)
      VALUES ($1, $2, 'CAT001', 'Category One')
      RETURNING *;
    `, [categoryId, '00000000-0000-0000-0000-000000000000']);

    activity = await db.one(`
      INSERT INTO tenantid.activities (id, tenant_id, category_id, activity_code, name)
      VALUES ($1, $2, 'CAT001', 'ACT001', 'Activity One')
      RETURNING *;
    `, ['22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000']);

    inserted = await model.insert({
      tenant_id: '00000000-0000-0000-0000-000000000000',
      unit_id: unit.id,
      activity_id: activity.id,
      budgeted_amount: 1000,
      status: 'draft',
      version: 1,
      is_current: true,
    });
  });

  afterEach(async () => {
    await model.deleteWhere({ id: inserted?.id });
    await db.none(`DELETE FROM tenantid.units WHERE id = $1`, [unit?.id]);
    await db.none(`DELETE FROM tenantid.activities WHERE id = $1`, [activity?.id]);
    await db.none(`DELETE FROM tenantid.categories WHERE id = $1`, [category?.id]);
  });

  it('should submit draft → submitted', async () => {
    const req = mockReq({ params: { id: inserted.id }, user: { email: 'tester@example.com' } });
    const res = mockRes();

    await controller.submit(req, res);

    const updated = await model.findById(inserted.id);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(updated.status).toBe('submitted');
    expect(updated.submitted_by).toBe('tester@example.com');
    expect(updated.submitted_at).toBeTruthy();
  });

  it('should not submit non-draft', async () => {
    await model.update(inserted.id, { status: 'approved' });

    const req = mockReq({ params: { id: inserted.id }, user: { email: 'tester@example.com' } });
    const res = mockRes();

    await controller.submit(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should approve submitted → approved', async () => {
    await model.update(inserted.id, { status: 'submitted' });

    const req = mockReq({ params: { id: inserted.id }, user: { email: 'approver@example.com' } });
    const res = mockRes();

    await controller.approve(req, res);

    const updated = await model.findById(inserted.id);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(updated.status).toBe('approved');
    expect(updated.approved_by).toBe('approver@example.com');
    expect(updated.approved_at).toBeTruthy();
  });

  it('should not approve invalid status', async () => {
    const req = mockReq({ params: { id: inserted.id }, user: { email: 'approver@example.com' } });
    const res = mockRes();

    await controller.approve(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});
