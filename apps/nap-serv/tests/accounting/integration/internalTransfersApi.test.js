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

describe('Internal Transfers API', () => {
  runExtendedCrudTests({
    routePrefix: '/api/accounting/v1/internal-transfers',
    updateField: 'amount',
    updateValue: 1200.50,
    beforeHook: async (ctx) => {
      const { db } = await import('../../../src/db/db.js');
      ctx.tenantId = uuid();
      ctx.accountFromId = uuid();
      ctx.accountToId = uuid();

      const classificationId = '2.2';

      await db.none(
        `INSERT INTO admin.account_classifications (id, name, type)
         VALUES ($1, 'Bank', 'asset') ON CONFLICT DO NOTHING`,
        [classificationId]
      );

      await db.none(
        `INSERT INTO tenantid.chart_of_accounts (id, tenant_id, code, name, classification_id, type, is_active, cash_basis, created_by, updated_by)
         VALUES 
         ($1, $2, '1001', 'Checking Account', $3, 'asset', true, false, 'integration-test', 'integration-test'),
         ($4, $2, '1002', 'Savings Account', $3, 'asset', true, false, 'integration-test', 'integration-test')
         ON CONFLICT DO NOTHING`,
        [ctx.accountFromId, ctx.tenantId, classificationId, ctx.accountToId]
      );
    },
    testRecord: (ctx) => ({
      tenant_id: ctx.tenantId,
      from_account_id: ctx.accountFromId,
      to_account_id: ctx.accountToId,
      transfer_date: '2025-05-09',
      amount: 1000.00,
      description: 'Initial transfer',
      created_by: 'integration-test',
      updated_by: 'integration-test',
    }),
  });
});
