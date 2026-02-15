/**
 * @file Schema definition for admin.nap_user_phones table
 * @module tenants/schemas/napUserPhonesSchema
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const napUserPhonesSchema = {
  dbSchema: 'admin',
  table: 'nap_user_phones',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: false,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true },
    { name: 'user_id', type: 'uuid', notNull: true },
    { name: 'phone_type', type: 'varchar(16)', notNull: true, default: 'cell' },
    { name: 'phone_number', type: 'varchar(32)', notNull: true },
    { name: 'is_primary', type: 'boolean', notNull: true, default: false },
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      { columns: ['user_id'], references: { table: 'nap_users', columns: ['id'], schema: 'admin' }, onDelete: 'CASCADE' },
    ],
    checks: [
      { type: 'Check', expression: "phone_type IN ('cell','home','work','fax','other')" },
    ],
    indexes: [
      { type: 'Index', columns: ['user_id'] },
    ],
  },
};

export default napUserPhonesSchema;
