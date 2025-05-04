import { jest } from '@jest/globals';
import { db } from '../../../src/db/db.js';
import UnitBudgetController from '../../../modules/activities/controllers/UnitBudgetController.js';
import { runControllerCrudUnitTests } from '../../util/runControllerCrudUnitTests.js';

jest.mock('../../../src/db/db.js');

runControllerCrudUnitTests({
  name: 'UnitBudget',
  controller: UnitBudgetController,
  modelName: 'projectUnitBudgets',
  db,
});
