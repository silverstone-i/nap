

import { jest } from '@jest/globals';
import { db } from '../../../src/db/db.js';
import InterCompaniesController from '../../../modules/core/controllers/InterCompaniesController.js';
import { runControllerCrudUnitTests } from '../../util/runControllerCrudUnitTests.js';

jest.mock('../../../src/db/db.js');

db.interCompanies = {
  insert: jest.fn(),
  findAll: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  delete: jest.fn().mockResolvedValue(1),
};

runControllerCrudUnitTests({
  name: 'InterCompanies',
  controller: InterCompaniesController,
  modelName: 'interCompanies',
  db,
});