import { runExtendedCrudTests } from '../../../tests/util/runExtendedCrudTests.js';
import { v4 as uuid } from 'uuid';

describe('Inter-Company Accounts API', () => {
  runExtendedCrudTests({
    routePrefix: '/api/accounting/v1/inter-company-accounts',
    updateField: 'description',
    updateValue: 'Updated Intercompany Account',
    testRecord: () => ({
      tenant_id: uuid(),
      company_id: uuid(),
      description: 'Intercompany Account',
      created_by: 'integration-test',
      updated_by: 'integration-test',
    }),
  });
});
