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
    { name: 'tenant_code', type: 'varchar(6)', notNull: true, colProps: { skip: c => !c.exists } }, // Tenant association
    { name: 'party_id', type: 'uuid', notNull: true }, // Foreign key to parties table
    { name: 'label', type: 'varchar(64)', notNull: true }, // e.g., 'remittance', 'physical'
    { name: 'address_line1', type: 'varchar(255)', notNull: true },
    { name: 'address_line2', type: 'varchar(255)' },
    { name: 'city', type: 'varchar(128)', notNull: true },
    { name: 'state', type: 'varchar(64)', notNull: true },
    { name: 'zip', type: 'varchar(16)', notNull: true },
    { name: 'country', type: 'varchar(64)' },
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['party_id'],
        references: {
          table: 'parties', // Unified parties table
          columns: ['id'],
        },
        onDelete: 'cascade', // Ensures addresses are deleted if the party is deleted
      },
    ],
    checks: [
      {
        type: 'Check',
        columns: ['label'],
        expression: "label IN ('remittance', 'physical', 'shipping')", // Valid address labels
      },
    ],
  },
};

export default schema;
