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

describe('Ledger Balances API', () => {
  runExtendedCrudTests({
    routePrefix: '/api/accounting/v1/ledger-balances',
    updateField: 'balance',
    updateValue: 4567.89,
    beforeHook: async ctx => {
      const { db } = await import('../../../src/db/db.js');
      ctx.tenantId = uuid();
      ctx.accountId = uuid();

      await db.none(
        `INSERT INTO tenantid.chart_of_accounts (id, tenant_id, code, name, type, is_active, cash_basis, created_by, updated_by)
         VALUES ($1, $2, '3000', 'Owner Equity', $3, 'equity', true, false, 'integration-test', 'integration-test')
         ON CONFLICT DO NOTHING`,
        [ctx.accountId, ctx.tenantId]
      );
    },
    testRecord: ctx => ({
      tenant_id: ctx.tenantId,
      account_id: ctx.accountId,
      as_of_date: '2025-05-09',
      balance: 1234.56,
      created_by: 'integration-test',
      updated_by: 'integration-test',
    }),
  });
});
