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
  table: 'addresses',
  hasAuditFields: true,
  version: '1.0.0', // Always use version 1.0.0
  softDelete: true, // Enable soft delete
  columns: [
    { name: 'id', type: 'uuid', default: 'uuidv7()', notNull: true, immutable: true }, // Primary key
    { name: 'entity_id', type: 'uuid', notNull: true }, // Foreign key to entities table
    { name: 'type', type: 'varchar(64)', notNull: true }, // e.g., 'mailing', 'physical'
    { name: 'address_line1', type: 'varchar(255)', notNull: true },
    { name: 'address_line2', type: 'varchar(255)' },
    { name: 'city', type: 'varchar(128)', notNull: true },
    { name: 'state', type: 'varchar(64)', notNull: true },
    { name: 'zip', type: 'varchar(16)', notNull: true },
    { name: 'country', type: 'varchar(64)', notNull: true },
    { name: 'deleted_at', type: 'timestamp' }, // Soft delete column
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['entity_id'],
        references: {
          table: 'entities', // Unified entities table
          columns: ['id'],
        },
        onDelete: 'cascade', // Ensures addresses are deleted if the entity is deleted
      },
    ],
  },
};

export default schema;
