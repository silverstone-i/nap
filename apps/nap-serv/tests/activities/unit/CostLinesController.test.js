import { jest } from '@jest/globals';
import { db } from '../../../src/db/db.js';
import CostLinesController from '../../../modules/activities/controllers/CostLinesController.js';
import { runControllerCrudUnitTests } from '../../util/runControllerCrudUnitTests.js';

jest.mock('../../../src/db/db.js');

runControllerCrudUnitTests({
  name: 'CostLines',
  controller: CostLinesController,
  modelName: 'costLines',
  db,
});