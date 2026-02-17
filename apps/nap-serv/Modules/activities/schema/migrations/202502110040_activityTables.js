/**
 * @file Migration: create activity module tables
 * @module activities/schema/migrations/202502110040_activityTables
 *
 * Tables created in FK dependency order:
 *   categories → activities → deliverables → deliverableAssignments
 *   → budgets → costLines → actualCosts → vendorParts
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { defineMigration } from '../../../../src/db/migrations/defineMigration.js';

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

  async up({ schema, models }) {
    if (schema === 'admin') return;

    for (const key of ACTIVITY_MODELS) {
      const model = models[key];
      if (model && typeof model.createTable === 'function') {
        await model.createTable();
      }
    }
  },

  async down({ schema, models }) {
    if (schema === 'admin') return;

    const reversed = [...ACTIVITY_MODELS].reverse();
    for (const key of reversed) {
      const model = models[key];
      if (model && model.schemaName && model.tableName) {
        await model.db.none(`DROP TABLE IF EXISTS ${model.schemaName}.${model.tableName} CASCADE`);
      }
    }
  },
});
