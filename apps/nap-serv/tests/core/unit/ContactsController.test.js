

import { jest } from '@jest/globals';
import { db } from '../../../src/db/db.js';
import ContactsController from '../../../modules/core/controllers/ContactsController.js';
import { runControllerCrudUnitTests } from '../../util/runControllerCrudUnitTests.js';

jest.mock('../../../src/db/db.js');

db.contacts = {
  insert: jest.fn(),
  findAll: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  delete: jest.fn().mockResolvedValue(1),
};

runControllerCrudUnitTests({
  name: 'Contacts',
  controller: ContactsController,
  modelName: 'contacts',
  db,
});