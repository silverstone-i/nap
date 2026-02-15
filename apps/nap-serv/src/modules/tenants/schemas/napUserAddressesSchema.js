/**
 * @file Schema definition for admin.nap_user_addresses table
 * @module tenants/schemas/napUserAddressesSchema
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const napUserAddressesSchema = {
  dbSchema: 'admin',
  table: 'nap_user_addresses',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: false,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true },
    { name: 'user_id', type: 'uuid', notNull: true },
    { name: 'address_type', type: 'varchar(16)', notNull: true, default: 'home' },
    { name: 'address_line_1', type: 'varchar(255)', default: null },
    { name: 'address_line_2', type: 'varchar(255)', default: null },
    { name: 'address_line_3', type: 'varchar(255)', default: null },
    { name: 'city', type: 'varchar(128)', default: null },
    { name: 'state_province', type: 'varchar(128)', default: null },
    { name: 'postal_code', type: 'varchar(20)', default: null },
    { name: 'country_code', type: 'char(2)', default: null },
    { name: 'is_primary', type: 'boolean', notNull: true, default: false },
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      { columns: ['user_id'], references: { table: 'nap_users', columns: ['id'], schema: 'admin' }, onDelete: 'CASCADE' },
    ],
    checks: [
      { type: 'Check', expression: "address_type IN ('home','work','mailing','other')" },
    ],
    indexes: [
      { type: 'Index', columns: ['user_id'] },
    ],
  },
};

export default napUserAddressesSchema;
