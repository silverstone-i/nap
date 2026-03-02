/**
 * @file Migration: create activity module tables in tenant schemas
 * @module activities/schema/migrations/202502110040_activityTables
 *
 * Tables created in FK dependency order:
 *   categories → activities → deliverables → deliverableAssignments
 *   → budgets → costLines → actualCosts → vendorParts
 *
 * The cost_lines.amount GENERATED column is added via ALTER TABLE
 * after table creation to keep it out of pg-schemata ColumnSets.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { defineMigration } from '../../../../db/migrations/defineMigration.js';

const ACTIVITY_MODELS = [
  'categories',
  'activities',
  'deliverables',
  'deliverableAssignments',
  'budgets',
  'costLines',
  'actualCosts',
  'vendorParts',
];

export default defineMigration({
  id: '202502110040-activity-tables',
  description: 'Create activity module tables (categories, activities, deliverables, budgets, cost lines, actual costs, vendor parts)',

  async up({ schema, models, db, pgp }) {
    if (schema === 'admin') return;
    const s = pgp.as.name(schema);

    for (const key of ACTIVITY_MODELS) {
      const model = models[key];
      if (model && typeof model.createTable === 'function') {
        await model.createTable();
      }
    }

    // Add GENERATED column — excluded from pg-schemata schema columns to keep
    // it out of INSERT/UPDATE ColumnSets (pg-promise skip only works for UPDATE).
    await db.none(`
      ALTER TABLE ${s}.cost_lines
      ADD COLUMN IF NOT EXISTS amount numeric(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED
    `);
  },

  async down({ schema, models, db, pgp }) {
    if (schema === 'admin') return;
    const s = pgp.as.name(schema);

    // Drop generated column first
    await db.none(`ALTER TABLE IF EXISTS ${s}.cost_lines DROP COLUMN IF EXISTS amount`);

    const reversed = [...ACTIVITY_MODELS].reverse();
    for (const key of reversed) {
      const model = models[key];
      if (model && model.schemaName && model.tableName) {
        await model.db.none(`DROP TABLE IF EXISTS ${pgp.as.name(model.schemaName)}.${pgp.as.name(model.tableName)} CASCADE`);
      }
    }
  },
});
