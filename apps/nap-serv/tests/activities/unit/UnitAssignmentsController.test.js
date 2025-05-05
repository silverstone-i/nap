import { jest } from '@jest/globals';
import { db } from '../../../src/db/db.js';
import UnitAssignmentsController from '../../../modules/activities/controllers/UnitAssignmentsController.js';
import { runControllerCrudUnitTests } from '../../util/runControllerCrudUnitTests.js';

jest.mock('../../../src/db/db.js');

runControllerCrudUnitTests({
  name: 'UnitAssignments',
  controller: UnitAssignmentsController,
  modelName: 'unitAssignments',
  db,
});

