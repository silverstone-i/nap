'use strict';

import { db } from '../../../src/db/db.js';
import { setupIntegrationTest } from '../../util/integrationHarness.js';
import { seedBudgetChain } from '../../util/seedBudgetChain.js';

describe('Integration: Budget and CostLine Linkage', () => {
  let server, teardown;

  beforeAll(async () => {
    ({ server, teardown } = await setupIntegrationTest(['admin', 'tenantid']));

    await seedBudgetChain(db);
  });

  afterAll(async () => {
    await teardown();
  });

  test('should link cost line to unit budget successfully', async () => {
    const result = await db.one(`
      SELECT id, unit_budget_id
      FROM tenantid.cost_lines
      WHERE id = '00000000-0000-0000-0000-000000000004'
    `);

    expect(result).toBeDefined();
    expect(result.unit_budget_id).toBe('00000000-0000-0000-0000-000000000003');
  });
});