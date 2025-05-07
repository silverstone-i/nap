import { jest } from '@jest/globals';
import { db } from '../../../src/db/db.js';
import ArInvoicesController from '../../../modules/ar/controllers/ArInvoicesController.js';
import { runControllerCrudUnitTests } from '../../util/runControllerCrudUnitTests.js';

jest.mock('../../../src/db/db.js');

db.arInvoices = {
  insert: jest.fn(),
  findAll: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  delete: jest.fn().mockResolvedValue(1),
};

runControllerCrudUnitTests({
  name: 'AR Invoice',
  controller: ArInvoicesController,
  modelName: 'arInvoices',
  db,
});
