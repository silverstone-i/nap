

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
  const vendor = await db.vendors.insert({
    tenant_id,
    name: 'Vendor for Parts',
    created_by: 'integration-test',
  });

  return { vendor };
};

export const cleanupTestDependencies = async () => {
  const all = await db.vendorParts.findAll();
  for (const row of all) await db.vendorParts.delete(row.id);

  const vendors = await db.vendors.findAll();
  for (const row of vendors) await db.vendors.delete(row.id);
};

const routePrefix = '/api/v1/vendor-parts';

const testContext = {};

await runExtendedCrudTests({
  routePrefix,
  testRecord: () => ({
    tenant_id,
    vendor_id: testContext.vendor.id,
    vendor_sku: 'VP-001',
    tenant_sku: 'TP-001',
    description: 'Vendor Part Description',
    unit: 'EA',
    unit_cost: 4.5,
    currency: 'USD',
    markup_pct: 10.0,
    is_active: true,
    created_by: 'integration-test',
  }),
  updateField: 'markup_pct',
  updateValue: 15.5,
  beforeHook: async () => {
    const deps = await setupTestDependencies();
    Object.assign(testContext, deps);
  },
  afterHook: cleanupTestDependencies,
});