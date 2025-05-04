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

await runExtendedCrudTests({
  updateField: 'description',
  routePrefix: '/api/v1/units',
  model: db.units,
  testRecord: {
    tenant_id: '00000000-0000-4000-a000-000000000001',
    unit_code: () => `UNIT-${Date.now()}`,
    description: 'Integration test unit',
    status: 'pending',
    created_by: 'integration-test',
  },
});
