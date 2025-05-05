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
    category_id: 'ACTUAL-CAT',
    name: 'Actual Category',
    created_by: 'integration-test',
  });

  const activity = await db.activities.insert({
    tenant_id,
    category_id: category.category_id,
    activity_code: 'ACTUAL-CODE',
    name: 'Actual Cost Activity',
    created_by: 'integration-test',
  });

  return { category, activity };
};

export const cleanupTestDependencies = async () => {
  const all = await db.actualCosts.findAll();
  for (const row of all) await db.actualCosts.delete(row.id);

  const activities = await db.activities.findAll();
  for (const row of activities) await db.activities.delete(row.id);

  const categories = await db.categories.findAll();
  for (const row of categories) await db.categories.delete(row.id);
};

const routePrefix = '/api/v1/actual-costs';

const testContext = {};

await runExtendedCrudTests({
  routePrefix,
  testRecord: () => ({
    tenant_id,
    activity_id: testContext.activity.id,
    amount: 250.75,
    currency: 'USD',
    reference: 'TEST-REF-001',
    approval_status: 'pending',
    incurred_on: '2024-01-15',
    created_by: 'integration-test',
  }),
  updateField: 'approval_status',
  updateValue: 'approved',
  beforeHook: async () => {
    const deps = await setupTestDependencies();
    Object.assign(testContext, deps);
  },
  afterHook: cleanupTestDependencies,
});
