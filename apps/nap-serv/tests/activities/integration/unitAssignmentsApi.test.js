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
  const project = await db.projects.insert({
    tenant_id,
    project_code: 'UA-PRJ',
    name: 'UA Project',
    status: 'planning',
    created_by: 'integration-test',
  });

  const unit = await db.units.insert({
    tenant_id,
    unit_code: 'UA-UNIT',
    description: 'Unit for assignment',
    status: 'pending',
    created_by: 'integration-test',
  });

  return { project, unit };
};

export const cleanupTestDependencies = async () => {
  const all = await db.unitAssignments.findAll();
  for (const row of all) await db.unitAssignments.delete(row.id);

  const projects = await db.projects.findAll();
  for (const row of projects) await db.projects.delete(row.id);

  const units = await db.units.findAll();
  for (const row of units) await db.units.delete(row.id);
};

const routePrefix = '/api/activities/v1/unit-assignments';

const testContext = {};

await runExtendedCrudTests({
  routePrefix,
  testRecord: () => ({
    tenant_id,
    project_id: testContext.project.id,
    unit_id: testContext.unit.id,
    assigned_code: 'U-01',
    status: 'planned',
    created_by: 'integration-test',
  }),
  updateField: 'status',
  updateValue: 'released',
  beforeHook: async () => {
    const deps = await setupTestDependencies();
    Object.assign(testContext, deps);
  },
  afterHook: cleanupTestDependencies,
});
