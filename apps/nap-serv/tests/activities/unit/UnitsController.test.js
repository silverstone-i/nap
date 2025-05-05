

import { jest } from '@jest/globals';
import { db } from '../../../src/db/db.js';
import UnitsController from '../../../modules/activities/controllers/UnitsController.js';
import { runControllerCrudUnitTests } from '../../util/runControllerCrudUnitTests.js';

jest.mock('../../../src/db/db.js');

runControllerCrudUnitTests({
  name: 'Units',
  controller: UnitsController,
  modelName: 'units',
  db,
});