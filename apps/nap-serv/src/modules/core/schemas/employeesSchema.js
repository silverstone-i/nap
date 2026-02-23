/**
 * @file Schema definition for tenant-scope employees table
 * @module core/schemas/employeesSchema
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const employeesSchema = {
  dbSchema: 'tenantid',
  table: 'employees',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'source_id', type: 'uuid' },
    { name: 'first_name', type: 'varchar(64)', notNull: true },
    { name: 'last_name', type: 'varchar(64)', notNull: true },
    { name: 'code', type: 'varchar(16)' },
    { name: 'position', type: 'varchar(64)' },
    { name: 'department', type: 'varchar(64)' },
    { name: 'email', type: 'varchar(128)', default: null },
    { name: 'is_app_user', type: 'boolean', notNull: true, default: false },
    { name: 'is_active', type: 'boolean', notNull: true, default: true },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['tenant_id', 'code']],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['source_id'],
        references: { table: 'sources', columns: ['id'] },
        onDelete: 'CASCADE',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['tenant_id'] },
      { type: 'Index', columns: ['tenant_id', 'code'], unique: true, where: 'deactivated_at IS NULL' },
      { type: 'Index', columns: ['tenant_id', 'email'], unique: true, where: 'email IS NOT NULL AND deactivated_at IS NULL' },
    ],
  },
};

export default employeesSchema;
