/**
 * @file Schema definition for tenant-scope tasks_master table
 * @module projects/schemas/tasksMasterSchema
 *
 * Master task definitions referenced by unit-level tasks.
 * Composite FK (tenant_id, task_group_code) → task_groups(tenant_id, code)
 * is added via ALTER TABLE in the migration (non-PK unique target).
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const tasksMasterSchema = {
  dbSchema: 'tenantid',
  table: 'tasks_master',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'code', type: 'varchar(16)', notNull: true },
    { name: 'task_group_code', type: 'varchar(16)', notNull: true },
    { name: 'name', type: 'varchar(128)', notNull: true },
    { name: 'default_duration_days', type: 'integer' },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['tenant_id', 'code']],
    indexes: [
      { type: 'Index', columns: ['tenant_id'] },
      { type: 'Index', columns: ['tenant_id', 'code'], unique: true, where: 'deactivated_at IS NULL' },
      { type: 'Index', columns: ['tenant_id', 'task_group_code'] },
    ],
  },
};

export default tasksMasterSchema;
