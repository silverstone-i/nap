

import { jest } from '@jest/globals';
import { db } from '../../../src/db/db.js';
import ReceiptsController from '../../../modules/ar/controllers/ReceiptsController.js';
import { runControllerCrudUnitTests } from '../../util/runControllerCrudUnitTests.js';

jest.mock('../../../src/db/db.js');

db.receipts = {
  insert: jest.fn(),
  findAll: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  delete: jest.fn().mockResolvedValue(1),
};

runControllerCrudUnitTests({
  name: 'Receipt',
  controller: ReceiptsController,
  modelName: 'receipts',
  db,
});