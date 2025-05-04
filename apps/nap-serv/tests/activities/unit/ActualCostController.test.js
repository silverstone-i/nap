import { jest } from '@jest/globals';
import { db } from '../../../src/db/db.js';
import { ActualCostsController } from '../../../modules/activities/controllers/ActualCostsController.js';
import { runControllerCrudUnitTests } from '../../util/runControllerCrudUnitTests.js';

jest.mock('../../../src/db/db.js');

runControllerCrudUnitTests({
  name: 'ActualCosts',
  controller: ActualCostsController,
  modelName: 'actualCosts',
  db,
});
