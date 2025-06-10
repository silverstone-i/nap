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

export const cleanupTestDependencies = async () => {
  const all = await db.addresses.findAll();
  for (const row of all) await db.addresses.delete(row.id);
};

const routePrefix = '/api/core/v1/addresses';

await runExtendedCrudTests({
  routePrefix,
  testRecord: () => ({
    tenant_id,
    label: 'Billing',
    street: '789 Commerce Blvd',
    city: 'Tradecity',
    state: 'TC',
    postal_code: '54321',
    country: 'USA',
    created_by: 'integration-test',
  }),
  updateField: 'label',
  updateValue: 'Shipping',
  afterHook: cleanupTestDependencies,
});
