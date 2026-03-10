/**
 * @file Schema definition for tenant-scope contacts table
 * @module core/schemas/contactsSchema
 *
 * First-class entity representing miscellaneous payees (one-off commissions,
 * charitable donations, etc.). Uses the polymorphic sources pattern with
 * source_type = 'contact' for linked addresses and phone numbers.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const contactsSchema = {
  dbSchema: 'tenantid',
  table: 'contacts',
  version: '1.1.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'source_id', type: 'uuid' },
    { name: 'name', type: 'varchar(128)', notNull: true },
    { name: 'code', type: 'varchar(16)' },
    { name: 'email', type: 'varchar(128)' },
    { name: 'roles', type: 'text[]', notNull: true, default: '{}' },
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
      { type: 'Index', columns: ['source_id'] },
    ],
  },
};

export default contactsSchema;
