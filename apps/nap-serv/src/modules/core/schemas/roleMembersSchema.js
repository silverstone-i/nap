/**
 * @file Schema definition for tenant-scope role_members table (RBAC)
 * @module core/schemas/roleMembersSchema
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const roleMembersSchema = {
  dbSchema: 'public',
  table: 'role_members',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: false,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true },
    { name: 'tenant_code', type: 'varchar(6)', default: null },
    { name: 'role_id', type: 'uuid', notNull: true },
    { name: 'user_id', type: 'uuid', notNull: true },
    { name: 'is_primary', type: 'boolean', notNull: true, default: false },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['role_id', 'user_id']],
    indexes: [
      { type: 'Index', columns: ['role_id'] },
      { type: 'Index', columns: ['user_id'] },
    ],
  },
};

export default roleMembersSchema;
