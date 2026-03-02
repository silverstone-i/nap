/**
 * @file Migration: create project module tables in tenant schemas
 * @module projects/schema/migrations/202502110020_projectEntities
 *
 * Tables created in FK dependency order via orderModels:
 *   template_units → template_tasks → template_cost_items, template_change_orders
 *   task_groups → tasks_master
 *   projects → units → tasks → cost_items, change_orders
 *
 * Composite FK tasks_master(tenant_id, task_group_code) → task_groups(tenant_id, code)
 * is added via ALTER TABLE after all tables are created (non-PK unique target).
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { defineMigration } from '../../../../db/migrations/defineMigration.js';
import { dropTables, getModelKey, isTableModel, orderModels } from '../../../../db/migrations/modelPlanner.js';

/** Project module table names (Phase 6) */
const PROJECT_TABLES = new Set([
  'template_units',
  'template_tasks',
  'template_cost_items',
  'template_change_orders',
  'task_groups',
  'tasks_master',
  'projects',
  'project_clients',
  'units',
  'tasks',
  'cost_items',
  'change_orders',
]);

export default defineMigration({
  id: '202502110020-project-entities',
  description: 'Create project module tables in tenant schemas',

  async up({ schema, models, db, pgp }) {
    if (schema === 'admin') return;
    const s = pgp.as.name(schema);

    const projectModels = Object.values(models).filter(
      (m) => isTableModel(m) && PROJECT_TABLES.has(m.schema?.table),
    );
    if (!projectModels.length) return;

    const ordered = orderModels(
      Object.fromEntries(projectModels.map((model) => [getModelKey(model), model])),
    );

    for (const model of ordered) {
      await model.createTable();
    }

    // Add GENERATED columns — excluded from pg-schemata schema columns to keep
    // them out of INSERT/UPDATE ColumnSets (pg-promise skip only works for UPDATE).
    await db.none(`
      ALTER TABLE ${s}.cost_items
      ADD COLUMN amount numeric(12,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED
    `);
    await db.none(`
      ALTER TABLE ${s}.template_cost_items
      ADD COLUMN amount numeric(12,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED
    `);

    // Add composite FK: tasks_master(tenant_id, task_group_code) → task_groups(tenant_id, code)
    await db.none(`
      ALTER TABLE ${s}.tasks_master
      ADD CONSTRAINT tasks_master_task_group_fk
      FOREIGN KEY (tenant_id, task_group_code)
      REFERENCES ${s}.task_groups (tenant_id, code)
      ON DELETE RESTRICT
    `);
  },

  async down({ schema, models, db, pgp }) {
    if (schema === 'admin') return;
    const s = pgp.as.name(schema);

    // Drop generated columns and composite FK first
    await db.none(`ALTER TABLE IF EXISTS ${s}.cost_items DROP COLUMN IF EXISTS amount`);
    await db.none(`ALTER TABLE IF EXISTS ${s}.template_cost_items DROP COLUMN IF EXISTS amount`);
    await db.none(`
      ALTER TABLE IF EXISTS ${s}.tasks_master
      DROP CONSTRAINT IF EXISTS tasks_master_task_group_fk
    `);

    const projectModels = Object.values(models).filter(
      (m) => isTableModel(m) && PROJECT_TABLES.has(m.schema?.table),
    );
    if (!projectModels.length) return;

    await dropTables(projectModels);
  },
});
