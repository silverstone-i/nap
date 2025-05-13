import request from 'supertest';
import app from '../../../src/app.js';
import { db } from '../../../src/db/db.js';
import crypto from 'node:crypto';

describe('CostLinesController integration', () => {
  let server;
  let unitBudgetId;

  beforeAll(async () => {
    const schemaList = ['admin', 'tenantid'];
    for (const schema of schemaList) {
      if (schema !== 'public') {
        await db.none(`DROP SCHEMA IF EXISTS ${schema} CASCADE; CREATE SCHEMA ${schema};`);
      }
    }
    const runMigrate = (await import('../../../scripts/runMigrate.js')).default;
    await runMigrate(db, { schemas: schemaList }, true);

    // Insert related data
    const tenantId = '00000000-0000-0000-0000-000000000000';
    const category = await db.one(
      `INSERT INTO tenantid.categories (tenant_id, category_id, name)
       VALUES ($1, 'CAT001', 'Test Category') RETURNING *`,
      [tenantId]
    );
    
    const activity = await db.one(
      `INSERT INTO tenantid.activities (tenant_id, category_id, activity_code, name)
       VALUES ($1, $2, 'ACT001', 'Test Activity') RETURNING *`,
      [tenantId, category.category_id]
    );
    const unit = await db.one(
      `INSERT INTO tenantid.units (tenant_id, unit_code, name)
       VALUES ($1, 'UNIT001', 'Test Unit') RETURNING *`,
      [tenantId]
    );
    const unitBudget = await db.one(
      `INSERT INTO tenantid.unit_budgets (tenant_id, unit_id, activity_id, status, quantity)
       VALUES ($1, $2, $3, 'approved', 10) RETURNING *`,
      [tenantId, unit.unit_id, activity.activity_id]
    );
    unitBudgetId = unitBudget.id;

    await db.none(
      `INSERT INTO tenantid.cost_lines (tenant_id, unit_budget_id, quantity, unit_price)
       VALUES ($1, $2, 10, 100)`,
      [tenantId, unitBudgetId]
    );
    console.log('unitBudgetId', unitBudgetId);
    
  });

  afterAll(async () => {
    await db.$pool.end();
  });

  it('should lock cost lines by unit budget ID', async () => {
    const res = await request(app)
      .post(`/api/activities/v1/cost-lines/lock/${unitBudgetId}`)
      .send();

    expect(res.statusCode).toBe(200);
    console.log('Full response body:', res.body);
    expect(res.body).toHaveProperty('locked');
    expect(typeof res.body.locked).toBe('number');
    expect(res.body.locked).toBeGreaterThan(0);
    // expect(true).toBe(true); // Placeholder for actual test
  });
});