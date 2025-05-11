'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import { runExtendedCrudTests } from '../../util/runExtendedCrudTests.js';
import { db } from '../../../src/db/db.js';
import request from 'supertest';

let unitId, activityId, category;

async function setup() {
  // Insert a category for the activity
  category = await db.categories.insert({
    tenant_id: '00000000-0000-4000-a000-000000000001',
    category_id: 'CAT-BUDGET',
    name: 'Unit Budget Category',
    created_by: 'integration-test',
  });

  // Insert an activity
  const activity = await db.activities.insert({
    tenant_id: '00000000-0000-4000-a000-000000000001',
    activity_code: 'ACT-BUDGET',
    name: 'Test Budget Activity',
    category_id: category.category_id,
    created_by: 'integration-test',
  });
  activityId = activity.id;

  // Insert a unit
  const unit = await db.units.insert({
    tenant_id: '00000000-0000-4000-a000-000000000001',
    unit_code: 'UNIT-BUDGET',
    status: 'pending',
    created_by: 'integration-test',
  });
  unitId = unit.id;
}

async function cleanup() {
  await db.units.delete(unitId);
  await db.activities.delete(activityId);
  await db.categories.delete(category.id);
}

await runExtendedCrudTests({
  updateField: 'unit',
  routePrefix: '/api/activities/v1/unit-budgets',
  model: db.unitBudgets,
  testRecord: {
    tenant_id: '00000000-0000-4000-a000-000000000001',
    unit_id: () => unitId,
    activity_id: () => activityId,
    budgeted_amount: 25000,
    version: 1,
    is_current: true,
    status: 'draft',
    created_by: 'integration-test',
  },
  beforeHook: setup,
  afterHook: cleanup,
  extraTests: (ctx) => {
    const prefix = '/api/activities/v1/unit-budgets';

    test('should submit a draft budget', async () => {
      const record = await db.unitBudgets.insert({
        tenant_id: '00000000-0000-4000-a000-000000000001',
        unitId,
        activityId,
        budgeted_amount: 12345,
        version: 1,
        is_current: true,
        status: 'draft',
        created_by: 'integration-test',
      });

      const res = await request(ctx.server).post(`${prefix}/${record.id}/submit`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('submitted');
    });

    test('should approve a submitted budget', async () => {
      const record = await db.unitBudgets.insert({
        tenant_id: '00000000-0000-4000-a000-000000000001',
        unitId,
        activityId,
        budgeted_amount: 98765,
        version: 1,
        is_current: true,
        status: 'draft',
        created_by: 'integration-test',
      });

      await request(ctx.server).post(`${prefix}/${record.id}/submit`);
      const res = await request(ctx.server).post(`${prefix}/${record.id}/approve`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('approved');
    });
  }
});
