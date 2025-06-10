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
  const all = await db.contacts.findAll();
  for (const row of all) await db.contacts.delete(row.id);
};

const routePrefix = '/api/core/v1/contacts';

await runExtendedCrudTests({
  routePrefix,
  testRecord: () => ({
    tenant_id,
    first_name: 'Test',
    last_name: 'Contact',
    email: 'test@example.com',
    phone: '555-1234',
    role: 'Integration',
    created_by: 'integration-test',
  }),
  updateField: 'last_name',
  updateValue: 'Updated',
  afterHook: cleanupTestDependencies,
});
