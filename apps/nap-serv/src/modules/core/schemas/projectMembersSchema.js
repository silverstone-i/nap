/**
 * @file Schema definition for tenant-scope project_members table (RBAC Layer 2)
 * @module core/schemas/projectMembersSchema
 *
 * Maps users to projects for data-scope enforcement.
 * FK to projects is added via ALTER TABLE in migration (cross-module dependency).
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const projectMembersSchema = {
  dbSchema: 'public',
  table: 'project_members',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: false,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true },
    { name: 'tenant_code', type: 'varchar(6)', default: null },
    { name: 'project_id', type: 'uuid', notNull: true },
    { name: 'user_id', type: 'uuid', notNull: true },
    { name: 'role', type: 'varchar(32)', notNull: true, default: 'member' },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['project_id', 'user_id']],
    foreignKeys: [],
    indexes: [
      { type: 'Index', columns: ['project_id'] },
      { type: 'Index', columns: ['user_id'] },
      { type: 'Index', columns: ['user_id', 'project_id'] },
    ],
  },
};

export default projectMembersSchema;
