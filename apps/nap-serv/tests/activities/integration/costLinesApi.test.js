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
  const existingCategories = await db.categories.findWhere([
    { tenant_id },
    { category_id: 'COST-MAT' }
  ]);
  for (const row of existingCategories) {
    await db.categories.delete(row.id);
  }

  const category = await db.categories.insert({
    tenant_id,
    category_id: 'COST-MAT',
    name: 'Materials',
    created_by: 'integration-test',
  });

  const subProject = await db.subProjects.insert({
    tenant_id,
    sub_project_code: 'COST-SP',
    description: 'Cost Line SP',
    status: 'pending',
    created_by: 'integration-test',
  });

  const activity = await db.activities.insert({
    tenant_id,
    category_id: category.category_id,
    activity_code: 'COST-ACT',
    name: 'Cost Activity',
    created_by: 'integration-test',
  });

  const vendor = await db.vendors.insert({
    tenant_id,
    name: 'Integration Vendor',
    created_by: 'integration-test',
  });

  const vendorPart = await db.vendorParts.insert({
    tenant_id,
    vendor_id: vendor.id,
    tenant_sku: 'SKU-123',
    description: 'Test Vendor Part',
    created_by: 'integration-test',
  });

  return { category, subProject, activity, vendor, vendorPart };
};

export const cleanupTestDependencies = async () => {
  const all = await db.vendorParts.findAll();
  for (const row of all) await db.vendorParts.delete(row.id);

  const vendors = await db.vendors.findAll();
  for (const row of vendors) await db.vendors.delete(row.id);

  const activities = await db.activities.findAll();
  for (const row of activities) await db.activities.delete(row.id);

  const subProjects = await db.subProjects.findAll();
  for (const row of subProjects) await db.subProjects.delete(row.id);

  const categories = await db.categories.findAll();
  for (const row of categories) await db.categories.delete(row.id);
};

const routePrefix = '/api/activities/v1/cost-lines';

const testContext = {};

await runExtendedCrudTests({
  routePrefix,
  testRecord: () => ({
    tenant_id,
    sub_project_id: testContext.subProject.id,
    vendor_id: testContext.vendor.id,
    activity_id: testContext.activity.id,
    tenant_sku: testContext.vendorPart.tenant_sku,
    source_type: 'material',
    quantity: 10,
    unit: 'EA',
    unit_price: 5.25,
    amount: 52.5,
    markup_pct: 0.1,
    assembly_code: 'ASM-001',
    created_by: 'integration-test',
    status: 'draft',
  }),
  updateField: 'source_type',
  updateValue: 'labor',
  beforeHook: async () => {
    const deps = await setupTestDependencies();
    Object.assign(testContext, deps);
  },
  afterHook: cleanupTestDependencies,
});

// const costLine = await db.costLines.insert(dto);
// console.log('Cost line created:', costLine);

// await cleanupTestDependencies();
