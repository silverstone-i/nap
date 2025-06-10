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

const routePrefix = '/api/tenants/v1/nap-users';

export const cleanupTestDependencies = async () => {
  const all = await db.napUsers.findAll();
  for (const row of all) await db.napUsers.delete(row.id);
};

await runExtendedCrudTests({
  routePrefix,
  testRecord: () => ({
    email: 'testuser@example.com',
    password_hash: 'hashed_password_value',
    first_name: 'Test',
    last_name: 'User',
    role: 'super_admin',
    is_active: true,
    created_by: 'integration-test',
  }),
  updateField: 'is_active',
  updateValue: false,
  afterHook: cleanupTestDependencies,
});
