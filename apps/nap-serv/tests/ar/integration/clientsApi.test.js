import { runExtendedCrudTests } from '../../../tests/util/runExtendedCrudTests.js';
import { v4 as uuid } from 'uuid';

describe('Clients API', () => {
  runExtendedCrudTests({
    routePrefix: '/api/ar/v1/clients',
    updateField: 'name',
    updateValue: 'Updated Client',
    testRecord: () => ({
      tenant_id: uuid(),
      client_code: 'CLNT1001',
      name: 'Sample Client',
      email: 'client@example.com',
      phone: '123-456-7890',
      tax_id: 'TAX123456',
      created_by: 'integration-test',
      updated_by: 'integration-test',
    }),
  });
});
