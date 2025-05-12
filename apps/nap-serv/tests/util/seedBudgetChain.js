

'use strict';

/**
 * Seed a full budget chain:
 * unit → category → activity → unit_budget → vendor → costline
 */
export async function seedBudgetChain(db, {
  tenantId = '11111111-1111-1111-1111-111111111111',
  unitId = '00000000-0000-0000-0000-000000000001',
  activityId = '00000000-0000-0000-0000-000000000002',
  budgetId = '00000000-0000-0000-0000-000000000003',
  vendorId = '00000000-0000-0000-0000-000000000099',
  categoryId = 'CAT001',
  unitName = 'Unit A',
  activityCode = 'ACT001',
  categoryName = 'Excavation',
  vendorName = 'Test Vendor'
} = {}) {
  // Seed unit
  await db.none(`
    INSERT INTO tenantid.units (id, tenant_id, name, unit_code, status)
    VALUES ($1, $2, $3, 'UNITCODE1', 'pending')
    ON CONFLICT DO NOTHING
  `, [unitId, tenantId, unitName]);

  // Seed category
  await db.none(`
    INSERT INTO tenantid.categories (id, tenant_id, category_id, name)
    VALUES ('00000000-0000-0000-0000-000000000050', $1, $2, $3)
    ON CONFLICT DO NOTHING
  `, [tenantId, categoryId, categoryName]);

  // Seed activity
  await db.none(`
    INSERT INTO tenantid.activities (id, tenant_id, category_id, activity_code, name)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT DO NOTHING
  `, [activityId, tenantId, categoryId, activityCode, 'Excavation']);

  // Seed unit budget
  await db.none(`
    INSERT INTO tenantid.unit_budgets (id, tenant_id, unit_id, activity_id, budgeted_amount, version)
    VALUES ($1, $2, $3, $4, 5000, 1)
    ON CONFLICT DO NOTHING
  `, [budgetId, tenantId, unitId, activityId]);

  // Seed vendor
  await db.none(`
    INSERT INTO tenantid.vendors (id, tenant_id, name)
    VALUES ($1, $2, $3)
    ON CONFLICT DO NOTHING
  `, [vendorId, tenantId, vendorName]);

  // Seed cost line
  await db.none(`
    INSERT INTO tenantid.cost_lines (
      id, tenant_id, unit_id, vendor_id, activity_id, unit_budget_id,
      source_type, quantity, unit_price, name
    )
    VALUES (
      '00000000-0000-0000-0000-000000000004',
      $1, $2, $3, $4, $5,
      'material', 100, 50, 'Seeded Cost Line'
    )
    ON CONFLICT DO NOTHING
  `, [tenantId, unitId, vendorId, activityId, budgetId]);
}