/**
 * @file Schema definition for tenant-scope tasks table (unit-level task instances)
 * @module projects/schemas/tasksSchema
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const tasksSchema = {
  dbSchema: 'tenantid',
  table: 'tasks',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'unit_id', type: 'uuid', notNull: true },
    { name: 'task_code', type: 'varchar(16)' },
    { name: 'name', type: 'varchar(128)', notNull: true },
    { name: 'duration_days', type: 'integer' },
    { name: 'status', type: 'varchar(20)', notNull: true, default: 'pending' },
    { name: 'parent_task_id', type: 'uuid' },
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['unit_id'],
        references: { table: 'units', columns: ['id'] },
        onDelete: 'CASCADE',
      },
      {
        type: 'ForeignKey',
        columns: ['parent_task_id'],
        references: { table: 'tasks', columns: ['id'] },
        onDelete: 'SET NULL',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['unit_id'] },
      { type: 'Index', columns: ['parent_task_id'] },
    ],
  },
};

export default tasksSchema;
