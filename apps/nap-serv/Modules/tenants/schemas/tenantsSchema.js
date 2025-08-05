'use strict';
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
  dbSchema: 'admin',
  table: 'tenants',
  hasAuditFields: true,
  softDelete: true,
  version: '0.1.0',

  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true },
    { name: 'tenant_code', type: 'varchar(6)', notNull: true, unique: true },
    { name: 'company', type: 'varchar(150)', notNull: true },
    { name: 'email', type: 'varchar(255)' },
    { name: 'phone', type: 'varchar(50)', default: null },
    { name: 'address', type: 'jsonb', default: `'{}'` },
    { name: 'contact_name', type: 'varchar(150)', default: null },
    { name: 'time_zone', type: 'varchar(50)', default: `'EST'` },
    { name: 'currency_code', type: 'varchar(5)', default: `'USD'` },
    { name: 'db_host', type: 'varchar(100)', notNull: true, default: `'localhost'` },
    { name: 'tax_id', type: 'varchar(30)', default: null },
    { name: 'allowed_modules', type: 'text[]', notNull: true, default: `'{}'` },
    { name: 'enable_match_logging', type: 'boolean', notNull: true, default: 'true' },
  ],

  constraints: {
    primaryKey: ['id'],
    unique: [['company'], ['tenant_code']],
    checks: [{ type: 'Check', expression: `char_length(company) > 2` }],
  },
};

export default schema;
