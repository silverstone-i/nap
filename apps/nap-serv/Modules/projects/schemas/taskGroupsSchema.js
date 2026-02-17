/**
 * @file Schema definition for tenant-scope task_groups table
 * @module projects/schemas/taskGroupsSchema
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const taskGroupsSchema = {
  dbSchema: 'tenantid',
  table: 'task_groups',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'code', type: 'varchar(16)', notNull: true },
    { name: 'name', type: 'varchar(64)', notNull: true },
    { name: 'description', type: 'text' },
    { name: 'sort_order', type: 'integer', default: 0 },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['tenant_id', 'code']],
    indexes: [
      { type: 'Index', columns: ['tenant_id'] },
      { type: 'Index', columns: ['tenant_id', 'code'], unique: true, where: 'deactivated_at IS NULL' },
    ],
  },
};

export default taskGroupsSchema;
