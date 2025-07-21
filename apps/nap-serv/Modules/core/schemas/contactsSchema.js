// @ts-check

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

/** @typedef {import('pg-schemata/src/schemaTypes').TableSchema} TableSchema */

/** @type {TableSchema} */
const schema = {
  dbSchema: 'tenantid',
  table: 'contacts',
  hasAuditFields: true,
  version: '1.0.0', // Always use version 1.0.0
  softDelete: true, // Enable soft delete
  columns: [
    { name: 'id', type: 'uuid', default: 'uuidv7()', notNull: true, immutable: true }, // Primary key
    { name: 'tenant_code', type: 'varchar(6)', notNull: true, colProps: { skip: c => !c.exists } }, // Tenant association
    { name: 'source_id', type: 'uuid', notNull: true }, // Foreign key to sources table
    { name: 'label', type: 'varchar(64)', notNull: true }, // e.g., 'sales', 'accounting'
    { name: 'name', type: 'varchar(255)', notNull: true },
    { name: 'email', type: 'varchar(255)', notNull: true },
    { name: 'phone', type: 'varchar(32)' },
    { name: 'mobile', type: 'varchar(32)' },
    { name: 'fax', type: 'varchar(32)' },
    { name: 'position', type: 'varchar(128)' }, // Position or title of the contact
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['source_id'],
        references: {
          table: 'sources', // Unified sources table
          columns: ['id'],
        },
        onDelete: 'cascade', // Ensures contacts are deleted if the source is deleted
      },
    ],
  },
};

export default schema;
