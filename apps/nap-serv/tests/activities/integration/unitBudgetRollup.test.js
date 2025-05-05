

'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import { db } from '../../../src/db/db.js';
import { setupIntegrationTest } from '../../util/integrationHarness.js';
import { seedBudgetChain } from '../../util/seedBudgetChain.js';

describe('Integration: Unit Budget Rollup', () => {
  let server, teardown;

  beforeAll(async () => {
    ({ server, teardown } = await setupIntegrationTest(['admin', 'tenantid']));
    await seedBudgetChain(db);
  });

  afterAll(async () => {
    await teardown();
  });

  test('should compare budgeted and actual cost per unit_budget_id', async () => {
    const result = await db.one(`
      SELECT
        ub.id AS unit_budget_id,
        ub.budgeted_amount::numeric(12,2),
        SUM(cl.quantity * cl.unit_price)::numeric(12,2) AS actual_cost
      FROM tenantid.unit_budgets ub
      LEFT JOIN tenantid.costlines cl ON cl.unit_budget_id = ub.id
      WHERE ub.id = '00000000-0000-0000-0000-000000000003'
      GROUP BY ub.id, ub.budgeted_amount
    `);

    expect(result.unit_budget_id).toBe('00000000-0000-0000-0000-000000000003');
    expect(result.budgeted_amount).toBe('5000.00');
    expect(result.actual_cost).toBe('5000.00');
  });
});

describe.skip('Budget status evaluation (deferred to Phase 5)', () => {
  test('should detect over budget condition', () => {
    // TODO: Implement budget status logic in Phase 5 and validate over/under budget cases
  });
});