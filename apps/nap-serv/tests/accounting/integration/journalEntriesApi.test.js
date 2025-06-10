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

describe('Journal Entries API', () => {
  runExtendedCrudTests({
    routePrefix: '/api/accounting/v1/journal-entries',
    updateField: 'status',
    updateValue: 'posted',
    beforeHook: async ctx => {
      const { db } = await import('../../../src/db/db.js');
      ctx.tenantId = uuid();
      ctx.companyId = uuid();

      await db.none(
        `INSERT INTO tenantid.inter_companies (id, tenant_id, company_code, company_name, created_by, updated_by)
         VALUES ($1, $2, 'AST', 'Asteroid Inc', 'integration-test', 'integration-test')
         ON CONFLICT DO NOTHING`,
        [ctx.companyId, ctx.tenantId]
      );
    },
    testRecord: ctx => ({
      tenant_id: ctx.tenantId,
      company_id: ctx.companyId,
      entry_date: '2025-05-09',
      status: 'pending',
      description: 'Test entry',
      created_by: 'integration-test',
      updated_by: 'integration-test',
    }),
  });
});
