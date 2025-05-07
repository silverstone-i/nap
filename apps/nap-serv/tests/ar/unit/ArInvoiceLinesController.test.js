import { jest } from '@jest/globals';
import { db } from '../../../src/db/db.js';
import ArInvoiceLinesController from '../../../modules/ar/controllers/ArInvoiceLinesController.js';
import { runControllerCrudUnitTests } from '../../util/runControllerCrudUnitTests.js';

jest.mock('../../../src/db/db.js');

db.arInvoiceLines = {
  insert: jest.fn(),
  findAll: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  delete: jest.fn().mockResolvedValue(1),
};

runControllerCrudUnitTests({
  name: 'AR Invoice Line',
  controller: ArInvoiceLinesController,
  modelName: 'arInvoiceLines',
  db,
});
