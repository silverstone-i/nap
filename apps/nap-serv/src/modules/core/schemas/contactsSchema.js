/**
 * @file Schema definition for tenant-scope contacts table
 * @module core/schemas/contactsSchema
 *
 * Contacts are linked to vendors, clients, or employees via the polymorphic
 * sources table (source_id FK with CASCADE delete).
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const contactsSchema = {
  dbSchema: 'tenantid',
  table: 'contacts',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true },
    { name: 'source_id', type: 'uuid', notNull: true },
    { name: 'name', type: 'varchar(128)', notNull: true },
    { name: 'email', type: 'varchar(128)' },
    { name: 'phone', type: 'varchar(32)' },
    { name: 'mobile', type: 'varchar(32)' },
    { name: 'fax', type: 'varchar(32)' },
    { name: 'position', type: 'varchar(64)' },
    { name: 'is_primary', type: 'boolean', notNull: true, default: false },
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['source_id'],
        references: { table: 'sources', columns: ['id'] },
        onDelete: 'CASCADE',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['source_id'] },
    ],
  },
};

export default contactsSchema;
