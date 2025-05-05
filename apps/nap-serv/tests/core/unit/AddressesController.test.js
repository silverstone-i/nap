import { jest } from '@jest/globals';
import { db } from '../../../src/db/db.js';
import AddressesController from '../../../modules/core/controllers/AddressesController.js';
import { runControllerCrudUnitTests } from '../../util/runControllerCrudUnitTests.js';

jest.mock('../../../src/db/db.js');

db.addresses = {
  insert: jest.fn(),
  findAll: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  delete: jest.fn().mockResolvedValue(1),
};

runControllerCrudUnitTests({
  name: 'Addresses',
  controller: AddressesController,
  modelName: 'addresses',
  db,
});