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
  table: 'nap_users',
  version: '0.1.0',
  hasAuditFields: true,
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'uuidv7()', notNull: true, immutable: true },
    { name: 'tenant_code', type: 'varchar(6)', notNull: true, unique: true, colProps: { skip: function (c) { return !c.exists; } } },
    { name: 'schema_name', type: 'varchar(6)', notNull: true, unique: true, colProps: { skip: function (c) { return !c.exists; } } },
    { name: 'email', type: 'varchar(255)', notNull: true, colProps: { skip: function (c) { return !c.exists; } } },
    { name: 'password_hash', type: 'text', notNull: true, colProps: { skip: function (c) { return !c.exists; } } },
    { name: 'user_name', type: 'varchar(100)', notNull: true, colProps: { skip: function (c) { return !c.exists; } } },
    { name: 'role', type: 'varchar(50)', notNull: true, colProps: { skip: function (c) { return !c.exists; } } },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['email']],
    checks: [ { type: 'Check', expression: `char_length(email) > 3` }

    /* TODO: Valid roles need to be checked in the tenant employees table
    // { type: 'Check', expression: `role IN ('super_admin', 'admin', 'support', 'user')` }, */ ],
    indexes: [ { type: 'Index', columns: ['email'] }, { type: 'Index', columns: ['role'] } ],
  },
};

export default schema;
