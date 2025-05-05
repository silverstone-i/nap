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

describe('Integration: Budget Aggregation', () => {
  let server, teardown;

  beforeAll(async () => {
    ({ server, teardown } = await setupIntegrationTest(['admin', 'tenantid']));
    await seedBudgetChain(db);
  });

  afterAll(async () => {
    await teardown();
  });

  test('should sum costlines per unit_budget_id correctly', async () => {
    const result = await db.any(`
      SELECT unit_budget_id, SUM(quantity * unit_price)::numeric(12,2) as total
      FROM tenantid.costlines
      GROUP BY unit_budget_id
    `);

    expect(result.length).toBeGreaterThan(0);
    const row = result.find(r => r.unit_budget_id === '00000000-0000-0000-0000-000000000003');
    expect(row).toBeDefined();
    expect(row.total).toBe('5000.00'); // 100 qty * 50 unit_price
  });
});
