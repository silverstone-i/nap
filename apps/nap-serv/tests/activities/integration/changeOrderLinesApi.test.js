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

const tenant_id = '00000000-0000-4000-a000-000000000001';

export const setupTestDependencies = async () => {
  const category = await db.categories.insert({
    tenant_id,
    category_id: 'CHANGE-ORD',
    name: 'Change Order Category',
    created_by: 'integration-test',
  });

  const deliverable = await db.deliverables.insert({
    tenant_id,
    deliverable_code: 'CHG-SP',
    description: 'Change Order Sub Project',
    status: 'pending',
    created_by: 'integration-test',
  });

  const activity = await db.activities.insert({
    tenant_id,
    category_id: category.category_id,
    activity_code: 'CHG-CODE',
    name: 'Change Order Activity',
    created_by: 'integration-test',
  });

  return { category, deliverable, activity };
};

export const cleanupTestDependencies = async () => {
  const all = await db.changeOrderLines.findAll();
  for (const row of all) await db.changeOrderLines.delete(row.id);

  const activities = await db.activities.findAll();
  for (const row of activities) await db.activities.delete(row.id);

  const deliverables = await db.deliverables.findAll();
  for (const row of deliverables) await db.deliverables.delete(row.id);

  const categories = await db.categories.findAll();
  for (const row of categories) await db.categories.delete(row.id);
};

const routePrefix = '/api/activities/v1/change-order-lines';

const testContext = {};

await runExtendedCrudTests({
  routePrefix,
  testRecord: () => ({
    tenant_id,
    deliverable_id: testContext.deliverable.id,
    activity_id: testContext.activity.id,
    reason: 'Scope change',
    change_amount: 1000.0,
    currency: 'USD',
    reference: 'CHG-REF-001',
    status: 'pending',
    created_by: 'integration-test',
  }),
  updateField: 'status',
  updateValue: 'approved',
  beforeHook: async () => {
    const deps = await setupTestDependencies();
    Object.assign(testContext, deps);
  },
  afterHook: cleanupTestDependencies,
});
