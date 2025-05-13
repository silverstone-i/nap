import request from 'supertest';
import app from '../../../src/app.js';
import { db } from '../../../src/db/db.js';
import crypto from 'node:crypto';
import { setupTestTenant } from '../../util/testUtils.js';

describe('ChangeOrderLinesController integration', () => {
  let tenantCode = 'tenantid';
  let unitId;
  let unitBudgetId;

  beforeAll(async () => {
    const schemaList = ['admin', 'tenantid'];
    for (const schema of schemaList) {
      if (schema !== 'public') {
        await db.none(
          `DROP SCHEMA IF EXISTS ${schema} CASCADE; CREATE SCHEMA ${schema};`
        );
      }
    }
    const runMigrate = (await import('../../../scripts/runMigrate.js')).default;
    await runMigrate(db, { schemas: schemaList }, true);

    // Insert related data
    const tenantId = '00000000-0000-0000-0000-000000000000';

    try {
      // Insert a unit budget and associated draft change order lines
      const [{ id: unit_id }] = await db.any(
        `
        INSERT INTO "${tenantCode}".units (tenant_id)
        VALUES ($1)
        RETURNING id;
      `,
        [tenantId]
      );
      unitId = unit_id;
      console.log('unitId', unitId);

      const [{ id: budgetId }] = await db.any(
        `
        INSERT INTO "${tenantCode}".unit_budgets (tenant_id, unit_id, status)
        VALUES ($1, $2, 'approved')
        RETURNING id;
        `,
        [tenantId, unitId]
      );
      unitBudgetId = budgetId;
      console.log('unitBudgetId', unitBudgetId);

      await db.none(
        `
        INSERT INTO "${tenantCode}".change_order_lines (tenant_id, unit_id, activity_id, change_amount, currency, status)
        VALUES
          ($1, $2, NULL, 1000, 'USD', 'pending'),
          ($1, $2, NULL, 2000, 'USD', 'pending');
      `,
        [tenantId, unitId]
      );
    } catch (error) {
      console.error('Error in beforeAll:', error);
    }
  });

  afterAll(async () => {
    // await teardownTestTenant(tenantCode);
    await db.$pool.end();
  });

  it('should lock change order lines by unit budget ID', async () => {
    console.log('unitBudgetId', unitBudgetId);

    const res = await request(app)
      .patch(`/api/activities/v1/change-order-lines/lock/${unitBudgetId}`)
      .expect(200);

    console.log('Full response body:', res.body);
    expect(res.body).toHaveProperty('approved');
    expect(typeof res.body.approved).toBe('number');
    expect(res.body.approved).toBeGreaterThan(0);

    const statuses = await db.any(
      `
      SELECT status FROM "${tenantCode}".change_order_lines WHERE unit_id = $1
    `,
      [unitBudgetId]
    );

    statuses.forEach(row => {
      expect(row.status).toBe('locked');
    });
  });
});
