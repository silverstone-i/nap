import { jest } from '@jest/globals';
import { db } from '../../../src/db/db.js';
import ChartOfAccountsController from '../../../modules/accounting/controllers/ChartOfAccountsController.js';
import { runControllerCrudUnitTests } from '../../util/runControllerCrudUnitTests.js';

jest.mock('../../../src/db/db.js');

const mockId = '550e8400-e29b-41d4-a716-446655440000';

db.chartOfAccounts = {
  insert: jest.fn().mockResolvedValue({ id: mockId, name: 'Test Chart Account' }),
  findAll: jest.fn().mockResolvedValue([{ id: mockId }]),
  findById: jest.fn().mockResolvedValue({ id: mockId }),
  update: jest.fn().mockResolvedValue({ id: mockId, name: 'Updated' }),
  delete: jest.fn().mockResolvedValue(1),
};

runControllerCrudUnitTests({
  name: 'Chart Of Accounts',
  controller: ChartOfAccountsController,
  modelName: 'chartOfAccounts',
  db,
});
