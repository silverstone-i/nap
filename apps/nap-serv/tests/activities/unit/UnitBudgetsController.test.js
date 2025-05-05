import { jest } from '@jest/globals';
import { db } from '../../../src/db/db.js';
import UnitBudgetsController from '../../../modules/activities/controllers/UnitBudgetsController.js';
import { runControllerCrudUnitTests } from '../../util/runControllerCrudUnitTests.js';

jest.mock('../../../src/db/db.js');

runControllerCrudUnitTests({
  name: 'UnitBudgets',
  controller: UnitBudgetsController,
  modelName: 'unitBudgets',
  db,
});
