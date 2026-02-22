/**
 * @file Schema definition for tenant-scope field_group_grants table (RBAC Layer 4)
 * @module core/schemas/fieldGroupGrantsSchema
 *
 * Assigns field groups to roles. A role can see the union of columns across
 * all granted groups plus any is_default groups.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const fieldGroupGrantsSchema = {
  dbSchema: 'public',
  table: 'field_group_grants',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: false,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true },
    { name: 'tenant_code', type: 'varchar(6)', default: null },
    { name: 'role_id', type: 'uuid', notNull: true },
    { name: 'field_group_id', type: 'uuid', notNull: true },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['role_id', 'field_group_id']],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['role_id'],
        references: { table: 'roles', columns: ['id'] },
        onDelete: 'CASCADE',
      },
      {
        type: 'ForeignKey',
        columns: ['field_group_id'],
        references: { table: 'field_group_definitions', columns: ['id'] },
        onDelete: 'CASCADE',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['role_id'] },
      { type: 'Index', columns: ['field_group_id'] },
    ],
  },
};

export default fieldGroupGrantsSchema;
