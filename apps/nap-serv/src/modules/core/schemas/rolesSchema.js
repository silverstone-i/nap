/**
 * @file Schema definition for tenant-scope roles table (RBAC)
 * @module core/schemas/rolesSchema
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const rolesSchema = {
  dbSchema: 'public',
  table: 'roles',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: false,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true },
    { name: 'tenant_code', type: 'varchar(6)', default: null },
    { name: 'code', type: 'varchar(64)', notNull: true },
    { name: 'name', type: 'varchar(128)', notNull: true },
    { name: 'description', type: 'varchar(255)', default: null },
    { name: 'is_system', type: 'boolean', notNull: true, default: false },
    { name: 'is_immutable', type: 'boolean', notNull: true, default: false },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['code']],
    indexes: [{ type: 'Index', columns: ['code'] }],
  },
};

export default rolesSchema;
