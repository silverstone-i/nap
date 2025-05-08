'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import {runExtendedCrudTests} from '../../util/runExtendedCrudTests.js';

await runExtendedCrudTests({
  routePrefix: '/api/activities/v1/categories',
  testRecord: () => ({ name: 'Test Category', created_by: 'Tester' }),
  updatedFields: () => ({ name: 'Updated Category', updated_by: 'Tester' }),
});
