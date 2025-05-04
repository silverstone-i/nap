import { jest } from '@jest/globals';
import { db } from '../../../src/db/db.js';
import UnitAssignmentController from '../../../modules/activities/controllers/UnitAssignmentController.js';
import { runControllerCrudUnitTests } from '../../util/runControllerCrudUnitTests.js';

jest.mock('../../../src/db/db.js');

runControllerCrudUnitTests({
  name: 'UnitAssignment',
  controller: UnitAssignmentController,
  modelName: 'unitAssignments',
  db,
});
