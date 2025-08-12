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
    { name: 'tenant_code', type: 'varchar(6)', notNull: true, unique: true, colProps: { skip: function(c){return !c.exists;} } },
    { name: 'company', type: 'varchar(150)', notNull: true, colProps: { skip: function(c){return !c.exists;} } },
    { name: 'email', type: 'varchar(255)', colProps: { skip: function(c){return !c.exists;} } },
    { name: 'phone', type: 'varchar(50)', default: null, colProps: { skip: function(c){return !c.exists;} } },
    { name: 'address', type: 'jsonb', default: `'{}'`, colProps: { mod: ':json', skip: function(c){return !c.exists;} } },
    { name: 'contact_name', type: 'varchar(150)', default: null, colProps: { skip: function(c){return !c.exists;} } },
    { name: 'time_zone', type: 'varchar(50)', default: `'EST'`, colProps: { skip: function(c){return !c.exists;} } },
    { name: 'currency_code', type: 'varchar(5)', default: `'USD'`, colProps: { skip: function(c){return !c.exists;} } },
    { name: 'db_host', type: 'varchar(100)', notNull: true, default: `'localhost'`, colProps: { skip: function(c){return !c.exists;} } },
    { name: 'tax_id', type: 'varchar(30)', default: null, colProps: { skip: function(c){return !c.exists;} } },
    { name: 'allowed_modules', type: 'text[]', notNull: true, default: `'{}'`, colProps: { mod: '^', skip: function(c){return !c.exists;} } },
  ],

  constraints: {
    primaryKey: ['id'],
    unique: [['company'], ['tenant_code']],
    checks: [{ type: 'Check', expression: `char_length(company) > 2` }],
  },
};

export default schema;
