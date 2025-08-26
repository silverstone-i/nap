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
const clientsSchema = {
  dbSchema: 'tenantid',
  table: 'clients',
  hasAuditFields: true,
  softDelete: true, // Enable soft delete
  version: '1.0.0', // Always use version 1.0.0
  columns: [
    { name: 'id', type: 'uuid', default: 'uuidv7()', notNull: true, immutable: true }, // Primary key
    { name: 'tenant_code', type: 'varchar(6)', notNull: true, colProps: { skip: c => !c.exists } }, // Tenant association
    { name: 'client_code', type: 'varchar(12)', notNull: true }, // Unique client code
    { name: 'name', type: 'varchar(255)', notNull: true }, // Client name
    { name: 'tax_id', type: 'varchar(64)' }, // Tax identification number
    { name: 'payment_terms', type: 'varchar(64)' }, // Payment terms
    { name: 'payment_method', type: 'varchar(64)' }, // Payment method
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['client_code'], ['name']],
    indexes: [
      {
        type: 'Index',
        columns: ['client_code'],
      },
      {
        type: 'Index',
        columns: ['name'],
      },
    ],
  },
};

export default clientsSchema;
