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
const employeesSchema = {
  dbSchema: 'tenantid',
  table: 'employees',
  hasAuditFields: true,
  softDelete: true, // Enable soft delete
  version: '1.0.0', // Always use version 1.0.0
  columns: [
    { name: 'id', type: 'uuid', default: 'uuidv7()', notNull: true, immutable: true }, // Primary key
    { name: 'tenant_id', type: 'uuid', notNull: true }, // Tenant association
    { name: 'employee_code', type: 'varchar(12)', notNull: true }, // Unique employee code
    { name: 'first_name', type: 'varchar(255)', notNull: true }, // Employee first name
    { name: 'last_name', type: 'varchar(255)', notNull: true }, // Employee last name
    { name: 'tax_id', type: 'varchar(64)' }, // Tax identification number
    { name: 'deleted_at', type: 'timestamp' }, // Soft delete column
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['employee_code']],
    indexes: [
      {
        type: 'Index',
        columns: ['employee_code'],
      },
    ],
  },
};

export default employeesSchema;
