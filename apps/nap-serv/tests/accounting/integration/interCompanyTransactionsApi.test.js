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

describe('InterCompany Transactions API', () => {
  runExtendedCrudTests({
    routePrefix: '/api/accounting/v1/inter-company-transactions',
    updateField: 'status',
    updateValue: 'posted',
    beforeHook: async ctx => {
      const { db } = await import('../../../src/db/db.js');
      ctx.tenantId = uuid();
      ctx.sourceCompanyId = uuid();
      ctx.targetCompanyId = uuid();

      await db.none(
        `INSERT INTO tenantid.inter_companies (id, tenant_id, company_name, created_by, updated_by)
         VALUES ($1, $2, 'SourceCo', 'integration-test', 'integration-test'),
                ($3, $2, 'TargetCo', 'integration-test', 'integration-test')
         ON CONFLICT DO NOTHING`,
        [ctx.sourceCompanyId, ctx.tenantId, ctx.targetCompanyId]
      );
    },
    testRecord: ctx => ({
      tenant_id: ctx.tenantId,
      source_company_id: ctx.sourceCompanyId,
      target_company_id: ctx.targetCompanyId,
      module: 'je',
      status: 'pending',
      description: 'Test intercompany transaction',
      created_by: 'integration-test',
      updated_by: 'integration-test',
    }),
  });
});
