import { jest } from '@jest/globals';
import { db } from '../../../src/db/db.js';
import CategoriesController from '../../../modules/activities/controllers/CategoriesController.js';
import { runControllerCrudUnitTests } from '../../util/runControllerCrudUnitTests.js';

jest.mock('../../../src/db/db.js');

runControllerCrudUnitTests({
  name: 'Category',
  controller: CategoriesController,
  modelName: 'categories',
  db,
});