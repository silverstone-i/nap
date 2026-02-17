/**
 * @file Schema definition for tenant-scope cost_items table
 * @module projects/schemas/costItemsSchema
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
    { name: 'amount', type: 'numeric(12,2)', generated: { expression: 'quantity * unit_cost', mode: 'stored' } },
  ],
  constraints: {
    primaryKey: ['id'],
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
