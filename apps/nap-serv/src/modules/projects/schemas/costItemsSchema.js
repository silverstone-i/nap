/**
 * @file Schema definition for tenant-scope cost_items table
 * @module projects/schemas/costItemsSchema
 *
 * Cost items belong to a task. The `amount` column is a PostgreSQL
 * GENERATED ALWAYS AS (quantity * unit_cost) STORED column.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const costItemsSchema = {
  dbSchema: 'tenantid',
  table: 'cost_items',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'task_id', type: 'uuid', notNull: true },
    { name: 'item_code', type: 'varchar(16)' },
    { name: 'description', type: 'varchar(255)' },
    { name: 'cost_class', type: 'varchar(16)', notNull: true },
    { name: 'cost_source', type: 'varchar(16)', notNull: true, default: 'budget' },
    { name: 'quantity', type: 'numeric(12,4)', notNull: true, default: 0 },
    { name: 'unit_cost', type: 'numeric(12,4)', notNull: true, default: 0 },
    // amount GENERATED ALWAYS AS (quantity * unit_cost) STORED — added via ALTER TABLE
    // in migration to keep it out of the ColumnSet (pg-schemata ColumnSet cannot skip
    // columns during INSERT). Available via RETURNING * / SELECT *.
  ],
  constraints: {
    primaryKey: ['id'],
    checks: [
      { type: 'Check', columns: ['cost_class'], expression: "cost_class IN ('labor', 'material', 'subcontract', 'equipment', 'other')" },
      { type: 'Check', columns: ['cost_source'], expression: "cost_source IN ('budget', 'change_order')" },
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['task_id'],
        references: { table: 'tasks', columns: ['id'] },
        onDelete: 'CASCADE',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['task_id'] },
    ],
  },
};

export default costItemsSchema;
