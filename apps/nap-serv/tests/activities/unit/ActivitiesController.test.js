import { jest } from '@jest/globals';
import { db } from '../../../src/db/db.js';
import ActivitiesController from '../../../modules/activities/controllers/ActivitiesController.js';
import { runControllerCrudUnitTests } from '../../util/runControllerCrudUnitTests.js';


jest.mock('../../../src/db/db.js');

db.activities = {
  insert: jest.fn(),
  findAll: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  delete: jest.fn().mockResolvedValue(1),
};

runControllerCrudUnitTests({
  name: 'Activity',
  controller: ActivitiesController,
  modelName: 'activities',
  db,
});