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
  const all = await db.interCompanies.findAll();
  for (const row of all) await db.interCompanies.delete(row.id);
};

const routePrefix = '/api/v1/inter-companies';

await runExtendedCrudTests({
  routePrefix,
  testRecord: () => ({
    tenant_id,
    company_code: 'TESTCO',
    company_name: 'Test Company',
    description: 'Integration test company',
    is_active: true,
    created_by: 'integration-test',
  }),
  updateField: 'company_name',
  updateValue: 'Updated Company',
  afterHook: cleanupTestDependencies,
});
