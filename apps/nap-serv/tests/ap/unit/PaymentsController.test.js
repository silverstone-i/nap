

import { jest } from '@jest/globals';
import { db } from '../../../src/db/db.js';
import PaymentsController from '../../../modules/ap/controllers/PaymentsController.js';
import { runControllerCrudUnitTests } from '../../util/runControllerCrudUnitTests.js';

jest.mock('../../../src/db/db.js');

const mockId = '550e8400-e29b-41d4-a716-446655440000';

db.payments = {
  insert: jest.fn().mockResolvedValue({ id: mockId, name: 'Test Payment' }),
  findAll: jest.fn().mockResolvedValue([{ id: mockId }]),
  findById: jest.fn().mockResolvedValue({ id: mockId }),
  update: jest.fn().mockResolvedValue({ id: mockId, name: 'Updated Payment' }),
  delete: jest.fn().mockResolvedValue(1),
};

runControllerCrudUnitTests({
  name: 'Payment',
  controller: PaymentsController,
  modelName: 'payments',
  db,
});