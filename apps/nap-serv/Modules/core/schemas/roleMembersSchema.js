'use strict';
// @ts-check

/*
 * Copyright © 2025-present, Ian Silverstone
 */

/** @typedef {import('pg-schemata/src/schemaTypes').TableSchema} TableSchema */

/** @type {TableSchema} */
const schema = {
  dbSchema: 'public',
  table: 'role_members',
  hasAuditFields: true,
  softDelete: false,
  version: '1.0.0',
  columns: [
    { name: 'id', type: 'uuid', default: 'uuidv7()', notNull: true, immutable: true },
    { name: 'tenant_code', type: 'varchar(6)', default: null },
    { name: 'role_id', type: 'uuid', notNull: true },
    { name: 'user_id', type: 'uuid', notNull: true },
    { name: 'is_primary', type: 'boolean', notNull: true, default: false },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['role_id', 'user_id']],
    indexes: [
      { type: 'Index', columns: ['role_id'] },
      { type: 'Index', columns: ['user_id'] },
    ],
  },
};

export default schema;
