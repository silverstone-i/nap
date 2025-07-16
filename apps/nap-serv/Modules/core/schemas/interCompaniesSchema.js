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
const interCompaniesSchema = {
  dbSchema: 'tenantid',
  table: 'inter_companies',
  hasAuditFields: true,
  version: '1.0.0',

  constraints: {
    primaryKey: ['id'],
    unique: [['tenant_id', 'company_code']],
    indexes: [{ type: 'Index', columns: ['tenant_id', 'company_code'] }],
  },

  columns: [
    { name: 'id', type: 'uuid', default: 'uuidv7()', notNull: true, immutable: true },
    { name: 'tenant_id', type: 'uuid', notNull: true },
    { name: 'company_code', type: 'varchar(8)', notNull: true },
    { name: 'company_name', type: 'varchar(64)', notNull: true },
    { name: 'description', type: 'text' },
    { name: 'is_active', type: 'boolean', notNull: true, default: true },
  ],
};

export default interCompaniesSchema;
