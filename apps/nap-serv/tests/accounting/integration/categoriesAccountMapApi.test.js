import { runExtendedCrudTests } from '../../../tests/util/runExtendedCrudTests.js';
import { v4 as uuid } from 'uuid';

describe('Category Account Map API', () => {
  runExtendedCrudTests({
    routePrefix: '/api/accounting/v1/categories-account-map',
    updateField: 'valid_to',
    updateValue: '2026-01-01',
    beforeHook: async (ctx) => {
      const { db } = await import('../../../src/db/db.js');
      ctx.tenantId = uuid();
      ctx.categoryId = 'MATL001';
      ctx.accountId = uuid();

      await db.none(`INSERT INTO tenantid.categories (tenant_id, category_id, name, created_by) VALUES ($1, $2, $3, $4)`, [
        ctx.tenantId, ctx.categoryId, 'Materials', 'integration-test',
      ]);

      await db.none(`INSERT INTO tenantid.chart_of_accounts (tenant_id, id, code, name, type, is_active, cash_basis, created_by) VALUES ($1, $2, $3, $4, $5, true, false, $6)`, [
        ctx.tenantId, ctx.accountId, '6000', 'Materials Expense', 'expense', 'integration-test',
      ]);
    },
    testRecord: (ctx) => ({
      tenant_id: ctx.tenantId,
      category_id: ctx.categoryId,
      account_id: ctx.accountId,
      valid_from: '2025-01-01',
      valid_to: '2025-12-31',
      created_by: 'integration-test',
      updated_by: 'integration-test',
    }),
  });
});