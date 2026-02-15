/**
 * @file Schema definition for admin.nap_users table
 * @module tenants/schemas/napUsersSchema
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const napUsersSchema = {
  dbSchema: 'admin',
  table: 'nap_users',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'tenant_code', type: 'varchar(6)', notNull: true },
    { name: 'email', type: 'varchar(128)', notNull: true },
    { name: 'user_name', type: 'varchar(128)', notNull: true },
    { name: 'full_name', type: 'varchar(255)', default: null },
    { name: 'password_hash', type: 'text', notNull: true },
    { name: 'tax_id', type: 'varchar(32)', default: null },
    { name: 'notes', type: 'text', default: null },
    { name: 'role', type: 'varchar(32)', notNull: true, default: 'member' },
    { name: 'status', type: 'varchar(20)', notNull: true, default: 'active' },
    { name: 'tenant_role', type: 'varchar(16)', default: null },
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      { columns: ['tenant_id'], references: { table: 'tenants', columns: ['id'], schema: 'admin' }, onDelete: 'CASCADE' },
    ],
    checks: [
      { type: 'Check', expression: "status IN ('active','invited','locked')" },
      { type: 'Check', expression: "tenant_role IS NULL OR tenant_role IN ('admin','billing')" },
    ],
    indexes: [
      { type: 'Index', columns: ['email'], unique: true, where: 'deactivated_at IS NULL' },
      { type: 'Index', columns: ['tenant_id'] },
      { type: 'Index', columns: ['tenant_code'] },
    ],
  },
};

export default napUsersSchema;
