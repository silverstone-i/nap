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
  table: 'entities',
  hasAuditFields: true,
  version: '1.0.0', // Always use version 1.0.0
  softDelete: true, // Enable soft delete
  columns: [
    { name: 'id', type: 'uuid', default: 'uuidv7()', notNull: true, immutable: true }, // Primary key
    { name: 'entity_type', type: 'varchar(64)', notNull: true }, // e.g., 'vendor', 'client', employee
  ],
  constraints: {
    primaryKey: ['id'],
  },
};

export default schema;
