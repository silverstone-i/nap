

import { jest } from '@jest/globals';
import { db } from '../../../src/db/db.js';
import CategoriesAccountMapController from '../../../modules/accounting/controllers/CategoriesAccountMapController.js';
import { runControllerCrudUnitTests } from '../../util/runControllerCrudUnitTests.js';

jest.mock('../../../src/db/db.js');

const mockId = '550e8400-e29b-41d4-a716-446655440000';

db.categoriesAccountMap = {
  insert: jest.fn().mockResolvedValue({ id: mockId, name: 'Test Map' }),
  findAll: jest.fn().mockResolvedValue([{ id: mockId }]),
  findById: jest.fn().mockResolvedValue({ id: mockId }),
  update: jest.fn().mockResolvedValue({ id: mockId, name: 'Updated' }),
  delete: jest.fn().mockResolvedValue(1),
};

runControllerCrudUnitTests({
  name: 'Categories Account Map',
  controller: CategoriesAccountMapController,
  modelName: 'categoriesAccountMap',
  db,
});