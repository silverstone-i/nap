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
  routePrefix: '/api/activities/v1/sub-projects',
  model: db.subProjects,
  testRecord: {
    tenant_id: '00000000-0000-4000-a000-000000000001',
    sub_project_code: () => `SP-${Date.now()}`,
    description: 'Integration test sub project',
    status: 'pending',
    created_by: 'integration-test',
  },
});
