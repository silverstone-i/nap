import { jest } from '@jest/globals';
import { db } from '../../../src/db/db.js';
import { ActivityController } from '../../../modules/activities/controllers/ActivityController.js';
import { runControllerCrudUnitTests } from '../../util/runControllerCrudUnitTests.js';

jest.mock('../../../src/db/db.js');

runControllerCrudUnitTests({
  name: 'Activity',
  controller: ActivityController,
  modelName: 'activities',
  db,
});