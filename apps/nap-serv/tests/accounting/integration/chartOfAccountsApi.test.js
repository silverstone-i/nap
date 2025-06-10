import { runExtendedCrudTests } from '../../../tests/util/runExtendedCrudTests.js';
import { v4 as uuid } from 'uuid';

describe('Chart of Accounts API', () => {
  runExtendedCrudTests({
    routePrefix: '/api/accounting/v1/chart-of-accounts',
    updateField: 'name',
    updateValue: 'Updated Account Name',
    beforeHook: async ctx => {
      const { db } = await import('../../../src/db/db.js');
      ctx.tenantId = uuid();
    },
    testRecord: ctx => ({
      tenant_id: ctx.tenantId,
      code: '5000',
      name: 'Raw Materials Expense',
      type: 'expense',
      is_active: true,
      cash_basis: false,
      created_by: 'integration-test',
      updated_by: 'integration-test',
    }),
  });
});
