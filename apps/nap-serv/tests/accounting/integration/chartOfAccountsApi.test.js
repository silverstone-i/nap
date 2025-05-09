

import { runExtendedCrudTests } from '../../../tests/util/runExtendedCrudTests.js';
import { v4 as uuid } from 'uuid';

describe('Chart of Accounts API', () => {
  runExtendedCrudTests({
    routePrefix: '/api/accounting/v1/chart-of-accounts',
    updateField: 'name',
    updateValue: 'Updated Account Name',
    beforeHook: async (ctx) => {
      const { db } = await import('../../../src/db/db.js');
      ctx.tenantId = uuid();
      ctx.classificationId = '5.9';

      await db.none(`INSERT INTO admin.account_classifications (id, name, type) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [
        ctx.classificationId, 'Temporary Accounts', 'asset',
      ]);
    },
    testRecord: (ctx) => ({
      tenant_id: ctx.tenantId,
      code: '5000',
      name: 'Raw Materials Expense',
      classification_id: ctx.classificationId,
      type: 'expense',
      is_active: true,
      cash_basis: false,
      created_by: 'integration-test',
      updated_by: 'integration-test',
    }),
  });
});