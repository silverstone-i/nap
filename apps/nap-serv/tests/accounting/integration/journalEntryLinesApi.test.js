'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import { runExtendedCrudTests } from '../../util/runExtendedCrudTests.js';
import { v4 as uuid } from 'uuid';

describe('Journal Entry Lines API', () => {
  runExtendedCrudTests({
    routePrefix: '/api/accounting/v1/journal-entry-lines',
    updateField: 'memo',
    updateValue: 'Updated memo content',
    beforeHook: async ctx => {
      const { db } = await import('../../../src/db/db.js');
      ctx.tenantId = uuid();
      ctx.companyId = uuid();
      ctx.accountId = uuid();
      ctx.entryId = uuid();

      await db.none(
        `INSERT INTO tenantid.inter_companies (id, tenant_id, company_code, company_name, created_by, updated_by)
         VALUES ($1, $2, 'REV', 'Revenue Corp', 'integration-test', 'integration-test')
         ON CONFLICT DO NOTHING`,
        [ctx.companyId, ctx.tenantId]
      );

      await db.none(
        `INSERT INTO tenantid.chart_of_accounts (id, tenant_id, code, name, type, is_active, cash_basis, created_by, updated_by)
         VALUES ($1, $2, '4000', 'Sales Revenue', $3, 'income', true, false, 'integration-test', 'integration-test')
         ON CONFLICT DO NOTHING`,
        [ctx.accountId, ctx.tenantId]
      );

      await db.none(
        `INSERT INTO tenantid.journal_entries (id, tenant_id, company_id, entry_date, status, created_by, updated_by)
         VALUES ($1, $2, $3, '2025-05-09', 'pending', 'integration-test', 'integration-test')
         ON CONFLICT DO NOTHING`,
        [ctx.entryId, ctx.tenantId, ctx.companyId]
      );
    },
    testRecord: ctx => ({
      tenant_id: ctx.tenantId,
      entry_id: ctx.entryId,
      account_id: ctx.accountId,
      debit: 0,
      credit: 1000.0,
      memo: 'Initial line item',
      created_by: 'integration-test',
      updated_by: 'integration-test',
    }),
  });
});
