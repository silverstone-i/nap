/**
 * @file Schema definition for tenant-scope field_group_definitions table (RBAC Layer 4)
 * @module core/schemas/fieldGroupDefinitionsSchema
 *
 * Defines named column groups per resource. Each group maps a group_name to an
 * array of column names. Groups marked is_default are granted to all roles.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const fieldGroupDefinitionsSchema = {
  dbSchema: 'public',
  table: 'field_group_definitions',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: false,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true },
    { name: 'tenant_code', type: 'varchar(6)', default: null },
    { name: 'module', type: 'varchar(32)', notNull: true },
    { name: 'router', type: 'varchar(64)', default: null },
    { name: 'group_name', type: 'varchar(64)', notNull: true },
    { name: 'columns', type: 'text[]', notNull: true },
    { name: 'is_default', type: 'boolean', notNull: true, default: false },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['module', 'router', 'group_name']],
    foreignKeys: [],
    indexes: [
      { type: 'Index', columns: ['module', 'router'] },
    ],
  },
};

export default fieldGroupDefinitionsSchema;
