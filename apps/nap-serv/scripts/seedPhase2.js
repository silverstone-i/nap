'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import { db } from '../src/db/db.js';

async function seedPhase2() {
  // Delete all seeded tables in dependency-safe order (reverse of creation)
  await db.none('DELETE FROM tenantid.project_activities');
  await db.none('DELETE FROM tenantid.projects');
  await db.none('DELETE FROM tenantid.clients');
  await db.none('DELETE FROM tenantid.activity_budgets');
  await db.none('DELETE FROM tenantid.activity_actuals');
  await db.none('DELETE FROM tenantid.costlines');
  await db.none('DELETE FROM tenantid.vendorparts');
  await db.none('DELETE FROM tenantid.activities');
  await db.none('DELETE FROM tenantid.categories');
  await db.none('DELETE FROM tenantid.vendors');
  await db.none('DELETE FROM tenantid.contacts');
  await db.none('DELETE FROM tenantid.addresses');

  const tenantId = '00000000-0000-4000-a000-000000000001';

  const client = await db.clients.insert({
    tenant_id: tenantId,
    client_code: 'CLI001',
    name: 'Test Client',
    created_by: 'seed-script',
  });

  const project = await db.projects.insert({
    tenant_id: tenantId,
    project_code: 'PRJ001',
    name: 'Test Project',
    client_id: client.id,
    created_by: 'seed-script',
  });

  // Ensure the required category exists for activities
  await db.none(
    `INSERT INTO tenantid.categories (id, tenant_id, category_id, name, created_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (tenant_id, category_id) DO NOTHING`,
    [
      '11111111-1111-4000-a111-000000000001',
      tenantId,
      'CAT01',
      'General',
      'seed-script'
    ]
  );

  const activities = await Promise.all(
    ['Excavation', 'Framing'].map((name, i) =>
      db.activities.insert({
        tenant_id: tenantId,
        activity_id: `ACT${i + 1}`,
        name,
        category_id: 'CAT01',
        type: 'turnkey',
        created_by: 'seed-script',
      })
    )
  );

  await Promise.all(
    activities.map(a =>
      db.projectActivities.insert({
        tenant_id: tenantId,
        project_id: project.id,
        activity_id: a.activity_id,
        created_by: 'seed-script',
      })
    )
  );

  const vendor = await db.vendors.insert({
    tenant_id: tenantId,
    name: 'ABC Supplies',
    created_by: 'seed-script',
  });

  const part = await db.vendorParts.insert({
    tenant_id: tenantId,
    vendor_id: vendor.id,
    vendor_sku: 'VS001',
    tenant_sku: 'TS001',
    description: 'Concrete',
    unit: 'yd',
    unit_cost: 100.0,
    markup_pct: 10.0,
    created_by: 'seed-script',
  });

  await db.activityBudgets.insert({
    tenant_id: tenantId,
    activity_id: activities[0].activity_id,
    budgeted_cost: 1000,
    budgeted_price: 1300,
    created_by: 'seed-script',
  });

  await db.costLines.insert({
    tenant_id: tenantId,
    activity_id: activities[0].activity_id,
    vendor_id: vendor.id,
    tenant_sku: part.tenant_sku,
    quantity: 10,
    markup_pct: 15.0,
    created_by: 'seed-script',
  });

  await db.activityActuals.insert({
    tenant_id: tenantId,
    activity_id: activities[0].activity_id,
    source_type: 'material',
    source_ref: part.id,
    unit: 'yd',
    quantity: 10,
    unit_cost: 100.0,
    created_by: 'seed-script',
  });

  console.log('✅ Phase II seed data inserted successfully.');
  process.exit(0);
}

seedPhase2().catch(err => {
  console.error('❌ Seeding error:', err);
  process.exit(1);
});
