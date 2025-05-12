
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
  await db.none('DELETE FROM tenantid.cost_lines');
  await db.none('DELETE FROM tenantid.vendorparts');
  await db.none('DELETE FROM tenantid.activities');
  await db.none('DELETE FROM tenantid.categories');
  await db.none('DELETE FROM tenantid.vendors');
  await db.none('DELETE FROM tenantid.contacts');
  await db.none('DELETE FROM tenantid.addresses');

  const tenantId = '00000000-0000-4000-a000-000000000001';

  // Insert client
  const client = await db.clients.insert({
    tenant_id: tenantId,
    client_code: 'CLI001',
    name: 'Test Client',
    created_by: 'seed-script',
  });

  // Insert two identical house projects
  const projects = await Promise.all(
    ['Zeblin 1', 'Zeblin 2'].map((name, i) =>
      db.projects.insert({
        tenant_id: tenantId,
        project_code: `PRJ00${i + 1}`,
        name,
        client_id: client.id,
        created_by: 'seed-script',
      })
    )
  );

  // Insert categories
  const categories = {
    'CAT-1': 'Foundation',
    'CAT-2': 'Framing',
  };

  for (const [id, name] of Object.entries(categories)) {
    await db.none(
      `INSERT INTO tenantid.categories (tenant_id, category_id, name, created_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, category_id) DO NOTHING`,
      [tenantId, id, name, 'seed-script']
    );
  }

  // Insert activities
  const activitiesData = [
    ['ACT-1', 'Foundation Posts', 'CAT-1'],
    ['ACT-2', 'Slab', 'CAT-1'],
    ['ACT-3', 'Foundation Walls', 'CAT-1'],
    ['ACT-4', 'Water Proofing', 'CAT-1'],
    ['ACT-5', 'Basement', 'CAT-2'],
    ['ACT-6', '1st Floor', 'CAT-2'],
    ['ACT-7', '2nd Floor', 'CAT-2'],
    ['ACT-8', 'Roof', 'CAT-2'],
  ];

  const activities = {};
  for (const [id, name, catId] of activitiesData) {
    const activity = await db.activities.insert({
      tenant_id: tenantId,
      activity_id: id,
      name,
      category_id: catId,
      type: 'turnkey',
      created_by: 'seed-script',
    });
    activities[id] = activity;
  }

  // Assign all activities to both projects
  for (const project of projects) {
    for (const activity of Object.values(activities)) {
      await db.projectActivities.insert({
        tenant_id: tenantId,
        project_id: project.id,
        activity_id: activity.activity_id,
        created_by: 'seed-script',
      });
    }
  }

  // Insert vendors
  const vendors = {
    'V-1': await db.vendors.insert({ tenant_id: tenantId, name: 'The Foundation Guy', created_by: 'seed-script' }),
    'V-2': await db.vendors.insert({ tenant_id: tenantId, name: 'The Lumber Guy', created_by: 'seed-script' }),
    'V-3': await db.vendors.insert({ tenant_id: tenantId, name: 'Framing is US', created_by: 'seed-script' }),
  };

  // Insert vendor parts
  const parts = {
    concrete: await db.vendorParts.insert({
      tenant_id: tenantId,
      vendor_id: vendors['V-1'].id,
      vendor_sku: 'res_concrete',
      tenant_sku: 'sku-1000',
      description: 'Concrete',
      unit: 'yd',
      unit_cost: 100,
      markup_pct: 10,
      created_by: 'seed-script',
    }),
    labor: await db.vendorParts.insert({
      tenant_id: tenantId,
      vendor_id: vendors['V-1'].id,
      vendor_sku: 'res_labor',
      tenant_sku: 'sku-1001',
      description: 'Labor',
      unit: 'hr',
      unit_cost: 15,
      markup_pct: 10,
      created_by: 'seed-script',
    }),
  };

  // Foundation Guy bid
  await db.costLines.insert({
    tenant_id: tenantId,
    activity_id: 'ACT-1',
    vendor_id: vendors['V-1'].id,
    tenant_sku: parts.concrete.tenant_sku,
    quantity: 350,
    markup_pct: 10,
    created_by: 'seed-script',
  });

  await db.costLines.insert({
    tenant_id: tenantId,
    activity_id: 'ACT-1',
    vendor_id: vendors['V-1'].id,
    tenant_sku: parts.labor.tenant_sku,
    quantity: 10,
    markup_pct: 10,
    created_by: 'seed-script',
  });

  // Framing bids: materials (Lumber Guy), labor (Framing is US)
  const framingCosts = [
    { act: 'ACT-5', vendor: 'V-2', type: 'material', amount: 8000 },
    { act: 'ACT-5', vendor: 'V-2', type: 'labor', amount: 4750 },
    { act: 'ACT-5', vendor: 'V-3', type: 'labor', amount: 3900 },
    { act: 'ACT-6', vendor: 'V-2', type: 'material', amount: 12000 },
    { act: 'ACT-6', vendor: 'V-2', type: 'labor', amount: 14500 },
    { act: 'ACT-6', vendor: 'V-3', type: 'labor', amount: 11700 },
    { act: 'ACT-7', vendor: 'V-2', type: 'material', amount: 13000 },
    { act: 'ACT-7', vendor: 'V-2', type: 'labor', amount: 14500 },
    { act: 'ACT-7', vendor: 'V-3', type: 'labor', amount: 11700 },
    { act: 'ACT-8', vendor: 'V-2', type: 'material', amount: 4500 },
    { act: 'ACT-8', vendor: 'V-2', type: 'labor', amount: 2350 },
    { act: 'ACT-8', vendor: 'V-3', type: 'labor', amount: 1950 },
  ];

  for (const cost of framingCosts) {
    await db.activityActuals.insert({
      tenant_id: tenantId,
      activity_id: cost.act,
      source_type: cost.type,
      source_ref: vendors[cost.vendor].id,
      quantity: 1,
      unit_cost: cost.amount,
      unit: 'lot',
      created_by: 'seed-script',
    });
  }

  console.log('✅ Phase II seed data inserted successfully.');
  process.exit(0);
}

seedPhase2().catch(err => {
  console.error('❌ Seeding error:', err);
  process.exit(1);
});
