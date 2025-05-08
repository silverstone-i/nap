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
  // Optional: Insert client and address records if referenced
  return {};
};

export const cleanupTestDependencies = async () => {
  const all = await db.projects.findAll();
  for (const row of all) await db.projects.delete(row.id);
};

const routePrefix = '/api/activities/v1/projects';

const testContext = {};

await runExtendedCrudTests({
  routePrefix,
  testRecord: () => ({
    tenant_id,
    project_code: 'PRJ-001',
    name: 'Test Project',
    description: 'Project description for integration test',
    notes: 'Integration test note',
    status: 'planning',
    created_by: 'integration-test',
  }),
  updateField: 'status',
  updateValue: 'budgeting',
  beforeHook: async () => {
    const deps = await setupTestDependencies();
    Object.assign(testContext, deps);
  },
  afterHook: cleanupTestDependencies,
});
