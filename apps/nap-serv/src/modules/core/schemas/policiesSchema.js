/**
 * @file Schema definition for tenant-scope policies table (RBAC)
 * @module core/schemas/policiesSchema
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const policiesSchema = {
  dbSchema: 'public',
  table: 'policies',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: false,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true },
    { name: 'tenant_code', type: 'varchar(6)', default: null },
    { name: 'role_id', type: 'uuid', notNull: true },
    { name: 'module', type: 'varchar(32)', notNull: true },
    { name: 'router', type: 'varchar(64)', default: null },
    { name: 'action', type: 'varchar(64)', default: null },
    { name: 'level', type: 'varchar(8)', notNull: true },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['role_id', 'module', 'router', 'action']],
    checks: [{ type: 'Check', expression: "level IN ('none','view','full')" }],
    indexes: [
      { type: 'Index', columns: ['role_id'] },
      { type: 'Index', columns: ['module', 'router', 'action'] },
    ],
  },
};

export default policiesSchema;
