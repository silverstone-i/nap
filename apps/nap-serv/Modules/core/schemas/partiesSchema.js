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
  table: 'parties',
  hasAuditFields: true,
  version: '1.0.0', // Always use version 1.0.0
  softDelete: true, // Enable soft delete
  columns: [
    { name: 'id', type: 'uuid', default: 'uuidv7()', notNull: true, immutable: true }, // Primary key
    { name: 'tenant_code', type: 'varchar(6)', notNull: true, colProps: { skip: c => !c.exists } }, // Tenant identifier
    { name: 'source_id', type: 'uuid', notNull: true }, // Renamed from 'party_id'
    { name: 'party_type', type: 'varchar(64)', notNull: true }, // e.g., 'vendor', 'client', employee
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['source_id', 'party_type']],
    checks: [
      {
        type: 'Check',
        columns: ['party_type'],
        expression: "party_type IN ('vendor', 'client', 'employee')",
      },
    ],
    indexes: [
      {
        type: 'Index',
        columns: ['source_id', 'party_type'],
      },
    ],
  },
};

export default schema;
