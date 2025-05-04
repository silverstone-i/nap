import { jest } from '@jest/globals';
import { db } from '../../../src/db/db.js';
import { CategoryController } from '../../../modules/activities/controllers/CategoryController.js';
import { runControllerCrudUnitTests } from '../../util/runControllerCrudUnitTests.js';

jest.mock('../../../src/db/db.js');

runControllerCrudUnitTests({
  name: 'Category',
  controller: CategoryController,
  modelName: 'categories',
  db,
});