/**
 * @file Migration: create project module tables
 * @module projects/schema/migrations/202502110020_projectTables
 *
 * Tables created in FK dependency order:
 *   template_units → template_tasks → template_cost_items, template_change_orders
 *   → projects → units → task_groups → tasks_master → tasks → cost_items → change_orders
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { defineMigration } from '../../../../src/db/migrations/defineMigration.js';

const PROJECT_MODELS = [
  // Templates first (units FK to template_units)
  'templateUnits',
  'templateTasks',
  'templateCostItems',
  'templateChangeOrders',
  // Core project tables
  'projects',
  'units',
  'taskGroups',
  'tasksMaster',
  'tasks',
  'costItems',
  'changeOrders',
];

export default defineMigration({
  id: '202502110020-project-tables',
  description: 'Create project module tables (projects, units, tasks, cost items, change orders, templates)',

  async up({ schema, models }) {
    if (schema === 'admin') return;

    for (const key of PROJECT_MODELS) {
      const model = models[key];
      if (model && typeof model.createTable === 'function') {
        await model.createTable();
      }
    }
  },

  async down({ schema, models }) {
    if (schema === 'admin') return;

    const reversed = [...PROJECT_MODELS].reverse();
    for (const key of reversed) {
      const model = models[key];
      if (model && model.schemaName && model.tableName) {
        await model.db.none(`DROP TABLE IF EXISTS ${model.schemaName}.${model.tableName} CASCADE`);
      }
    }
  },
});
