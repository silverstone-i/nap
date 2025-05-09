import { runExtendedCrudTests } from '../../../tests/util/runExtendedCrudTests.js';

describe('Account Classifications API', () => {
  runExtendedCrudTests({
    routePrefix: '/api/accounting/v1/account-classifications',
    updateField: 'name',
    updateValue: 'Updated Classification',
    testRecord: () => ({
      id: '5.9',
      name: 'Temporary Accounts',
      type: 'equity',
      created_by: 'integration-test',
      updated_by: 'integration-test',
    }),
  });
});
