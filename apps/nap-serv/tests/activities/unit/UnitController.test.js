

import { jest } from '@jest/globals';
import { db } from '../../../src/db/db.js';
import UnitController from '../../../modules/activities/controllers/UnitController.js';
import { runControllerCrudUnitTests } from '../../util/runControllerCrudUnitTests.js';

jest.mock('../../../src/db/db.js');

runControllerCrudUnitTests({
  name: 'Unit',
  controller: UnitController,
  modelName: 'projectUnits',
  db,
});