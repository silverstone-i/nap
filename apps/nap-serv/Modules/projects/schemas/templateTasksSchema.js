/**
 * @file Schema definition for tenant-scope template_tasks table
 * @module projects/schemas/templateTasksSchema
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const templateTasksSchema = {
  dbSchema: 'tenantid',
  table: 'template_tasks',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'template_unit_id', type: 'uuid', notNull: true },
    { name: 'task_code', type: 'varchar(16)', notNull: true },
    { name: 'name', type: 'varchar(128)', notNull: true },
    { name: 'duration_days', type: 'integer' },
    { name: 'parent_code', type: 'varchar(16)' },
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['template_unit_id'],
        references: { table: 'template_units', columns: ['id'] },
        onDelete: 'CASCADE',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['template_unit_id'] },
    ],
  },
};

export default templateTasksSchema;
